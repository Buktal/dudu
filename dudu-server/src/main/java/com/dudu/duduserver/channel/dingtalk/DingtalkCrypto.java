package com.dudu.duduserver.channel.dingtalk;

import com.dudu.duduserver.channel.support.AesEnvelopeCodec;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;

/**
 * 钉钉加解密原语（事实库 §4.1，MockPulse crypto.rs/wecom crypto.rs 对拍）：sha1 四参
 * 签名与 AES 信封。AES 信封骨架（43 位 EncodingAESKey 解码、AES-256-CBC、IV 取 AESKey
 * 前 16 字节、32 字节块 PKCS#7、random+msg_len+msg+ownerKey 结构）收敛到
 * {@link AesEnvelopeCodec} 统一口径；钉钉的 receiveId 双维度（企业 CorpId / 应用
 * appKey / 套件 SuiteKey）在解密入口传期望值即比对。密钥与密文形态错误、包损坏、
 * ownerKey 不一致一律抛 {@link IllegalArgumentException}，由协议层转拒绝响应。
 */
public final class DingtalkCrypto {

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
     * @param encrypt     密文（Base64）
     * @param aesKeyB64   EncodingAESKey（43 位）
     * @param expectOwner 期望 ownerKey（企业 CorpId / 应用 appKey / 套件 SuiteKey）
     * @return 明文与实际包尾 ownerKey
     */
    public static PlainMessage decrypt(String encrypt, String aesKeyB64, String expectOwner) {
        AesEnvelopeCodec.Plain plain = AesEnvelopeCodec.decrypt(
            AesEnvelopeCodec.decodeKey(aesKeyB64), encrypt, expectOwner);
        return new PlainMessage(plain.message(), plain.receiveId());
    }

    /**
     * 加密信封：16 字节随机 + 4 字节大端长度 + 明文 + ownerKey，32 字节块 PKCS#7
     * 补齐后 AES-256-CBC 加密取 Base64，用于加密 success 回包与测试回填。
     *
     * @param message   明文
     * @param aesKeyB64 EncodingAESKey（43 位）
     * @param ownerKey  包尾归属标识
     * @return 密文（Base64）
     */
    public static String encrypt(String message, String aesKeyB64, String ownerKey) {
        // 信封随机前缀 16 字节，每次加密现取
        byte[] random16 = new byte[16];
        RANDOM.nextBytes(random16);
        return AesEnvelopeCodec.encrypt(AesEnvelopeCodec.decodeKey(aesKeyB64), random16,
            message.getBytes(StandardCharsets.UTF_8), ownerKey.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * 解密产物：明文与包尾 ownerKey（钉钉 ReceiveId 双维度：企业 CorpId / 应用 appKey）。
     */
    public record PlainMessage(String message, String ownerKey) {
    }
}
