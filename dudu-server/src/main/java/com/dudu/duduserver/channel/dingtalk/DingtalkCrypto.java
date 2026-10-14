package com.dudu.duduserver.channel.dingtalk;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

/**
 * 钉钉加解密原语（事实库 §4.1，MockPulse crypto.rs/wecom crypto.rs 对拍）：sha1 四参
 * 签名与 AES 信封。AESKey = Base64Decode(EncodingAESKey + "=")（43 位 + 1，宽解码收
 * 32 字节）；AES-256-CBC，IV 取 AESKey 前 16 字节；包 = random(16B) + msg_len(4B 大端)
 * + msg + ownerKey，补齐为 32 字节块 PKCS#7（官方向量 pad 值 22 > 16 实证）。解密须
 * 校验包尾 ownerKey 与期望一致。密钥与密文形态错误、包损坏、ownerKey 不一致一律抛
 * {@link IllegalArgumentException}，由协议层转拒绝响应。
 */
public final class DingtalkCrypto {

    // AES 信封几何：随机串 16 字节 + 明文长度 4 字节（大端），其后是明文与 ownerKey
    private static final int RANDOM_BYTES = 16;
    private static final int LENGTH_BYTES = 4;
    // 钉钉 PKCS#7 按 32 字节块补齐（区别于标准 16 字节块），pad 取值 1..=32
    private static final int PKCS7_BLOCK = 32;
    // AESKey 明文长度：EncodingAESKey 43 位补 "=" 后 Base64 解码得 32 字节
    private static final int AES_KEY_BYTES = 32;

    private static final SecureRandom RANDOM = new SecureRandom();

    private DingtalkCrypto() {
    }

    /**
     * 加密信封明文：四参字典序排序拼接后取 SHA-1 十六进制小写。
     *
     * @param token     回调加解密 Token
     * @param timestamp 推送时间戳（毫秒字符串）
     * @param nonce     随机串
     * @param encrypt   密文（Base64）
     * @return 签名十六进制串
     */
    public static String buildSignature(String token, String timestamp, String nonce, String encrypt) {
        String[] params = {token, timestamp, nonce, encrypt};
        Arrays.sort(params);
        try {
            MessageDigest sha1 = MessageDigest.getInstance("SHA-1");
            byte[] digest = sha1.digest(String.join("", params).getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte item : digest) {
                hex.append(Character.forDigit((item >> 4) & 0xF, 16));
                hex.append(Character.forDigit(item & 0xF, 16));
            }
            return hex.toString();
        } catch (Exception e) {
            // SHA-1 为 JVM 必带算法，此处仅收拢受检异常
            throw new IllegalStateException("SHA-1 摘要不可用", e);
        }
    }

    /**
     * 验签：重算签名与提交值忽略大小写比对。
     *
     * @param signature 推送携带的签名
     * @param token     回调加解密 Token
     * @param timestamp 推送时间戳
     * @param nonce     随机串
     * @param encrypt   密文（Base64）
     * @return 签名是否一致
     */
    public static boolean verify(String signature, String token, String timestamp, String nonce, String encrypt) {
        if (signature == null || signature.isEmpty()) {
            return false;
        }
        return signature.equalsIgnoreCase(buildSignature(token, timestamp, nonce, encrypt));
    }

    /**
     * 解密信封：密文 Base64 → AES-256-CBC → 去 32 字节块 PKCS#7 → 按 16+4 头切出
     * 明文与包尾 ownerKey 并校验。
     *
     * @param encrypt   密文（Base64）
     * @param aesKeyB64 EncodingAESKey（43 位）
     * @param expectOwner 期望 ownerKey（企业 CorpId / 应用 appKey / 套件 SuiteKey）
     * @return 明文与实际包尾 ownerKey
     */
    public static PlainMessage decrypt(String encrypt, String aesKeyB64, String expectOwner) {
        byte[] aesKey = deriveAesKey(aesKeyB64);
        byte[] packed = aesCbc(false, decodeStrict(encrypt, "密文不是合法 Base64"), aesKey);
        if (packed.length < RANDOM_BYTES + LENGTH_BYTES) {
            throw new IllegalArgumentException("解密包过短：不足 16+4 字节头");
        }
        int pad = packed[packed.length - 1] & 0xFF;
        if (pad < 1 || pad > PKCS7_BLOCK || packed.length < pad) {
            throw new IllegalArgumentException("PKCS#7 补齐非法：pad=" + pad);
        }
        for (int i = packed.length - pad; i < packed.length; i++) {
            if ((packed[i] & 0xFF) != pad) {
                throw new IllegalArgumentException("PKCS#7 补齐非法：补齐字节不一致");
            }
        }
        byte[] unpadded = Arrays.copyOf(packed, packed.length - pad);
        if (unpadded.length < RANDOM_BYTES + LENGTH_BYTES) {
            throw new IllegalArgumentException("解密包过短：不足 16+4 字节头");
        }
        int messageLength = ByteBuffer.wrap(unpadded, RANDOM_BYTES, LENGTH_BYTES).getInt();
        if (messageLength < 0 || RANDOM_BYTES + LENGTH_BYTES + messageLength > unpadded.length) {
            throw new IllegalArgumentException("明文长度越界：msg_len=" + messageLength);
        }
        String message = new String(unpadded, RANDOM_BYTES + LENGTH_BYTES, messageLength, StandardCharsets.UTF_8);
        String ownerKey = new String(unpadded, RANDOM_BYTES + LENGTH_BYTES + messageLength,
            unpadded.length - RANDOM_BYTES - LENGTH_BYTES - messageLength, StandardCharsets.UTF_8);
        if (!ownerKey.equals(expectOwner)) {
            throw new IllegalArgumentException("ReceiveId 校验错误：期望 " + expectOwner + "，实际 " + ownerKey);
        }
        return new PlainMessage(message, ownerKey);
    }

    /**
     * 加密信封：16 字节随机 + 4 字节大端长度 + 明文 + ownerKey，32 字节块 PKCS#7
     * 补齐后 AES-256-CBC 加密取 Base64，用于加密 success 回包与测试回填。
     *
     * @param message  明文
     * @param aesKeyB64 EncodingAESKey（43 位）
     * @param ownerKey 包尾归属标识
     * @return 密文（Base64）
     */
    public static String encrypt(String message, String aesKeyB64, String ownerKey) {
        byte[] aesKey = deriveAesKey(aesKeyB64);
        byte[] messageBytes = message.getBytes(StandardCharsets.UTF_8);
        byte[] ownerBytes = ownerKey.getBytes(StandardCharsets.UTF_8);
        byte[] body = new byte[RANDOM_BYTES + LENGTH_BYTES + messageBytes.length + ownerBytes.length];
        RANDOM.nextBytes(body);
        ByteBuffer.wrap(body).putInt(RANDOM_BYTES, messageBytes.length);
        System.arraycopy(messageBytes, 0, body, RANDOM_BYTES + LENGTH_BYTES, messageBytes.length);
        System.arraycopy(ownerBytes, 0, body, RANDOM_BYTES + LENGTH_BYTES + messageBytes.length, ownerBytes.length);
        int pad = PKCS7_BLOCK - body.length % PKCS7_BLOCK;
        byte[] padded = Arrays.copyOf(body, body.length + pad);
        Arrays.fill(padded, body.length, padded.length, (byte) pad);
        return Base64.getEncoder().encodeToString(aesCbc(true, padded, aesKey));
    }

    // EncodingAESKey（43 位）补 "=" 后宽 Base64 解码，非 32 字节即为形态错误
    private static byte[] deriveAesKey(String aesKeyB64) {
        if (aesKeyB64 == null) {
            throw new IllegalArgumentException("EncodingAESKey 缺失");
        }
        // 官方规格：EncodingAESKey 固定 43 位，补 "=" 解出 32 字节（与企微族四实现统一口径）
        if (aesKeyB64.length() != 43) {
            throw new IllegalArgumentException("EncodingAESKey 须为 43 位");
        }
        byte[] key = Base64.getDecoder().decode(aesKeyB64 + "=");
        if (key.length != AES_KEY_BYTES) {
            throw new IllegalArgumentException("EncodingAESKey 形态错误：解码得 " + key.length + " 字节");
        }
        return key;
    }

    // 密文 Base64 严格解码（与密钥的宽解码区分：坏字符与残位即拒绝）
    private static byte[] decodeStrict(String encrypt, String reason) {
        try {
            return Base64.getDecoder().decode(encrypt);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException(reason, e);
        }
    }

    // AES-256-CBC，IV 取 AESKey 前 16 字节；解密侧 NoPadding，补齐在上层手工校验
    private static byte[] aesCbc(boolean encryptMode, byte[] input, byte[] aesKey) {
        try {
            Cipher cipher = Cipher.getInstance("AES/CBC/NoPadding");
            cipher.init(encryptMode ? Cipher.ENCRYPT_MODE : Cipher.DECRYPT_MODE,
                new SecretKeySpec(aesKey, "AES"), new IvParameterSpec(Arrays.copyOf(aesKey, 16)));
            return cipher.doFinal(input);
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("AES 信封运算失败", e);
        }
    }

    /**
     * 解密产物：明文与包尾 ownerKey（钉钉 ReceiveId 双维度：企业 CorpId / 应用 appKey）。
     */
    public record PlainMessage(String message, String ownerKey) {
    }
}
