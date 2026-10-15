package com.dudu.duduserver.channel.support;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.Arrays;
import java.util.Base64;

/**
 * 企微族回调报文 AES-256-CBC 信封共享骨架（微信小程序、企业微信、钉钉、小红书四实现
 * 同源，事实见 docs/research/channels/ 各渠道文档）：AESKey = Base64_Decode
 * (EncodingAESKey + "=")（官方固定 43 位口径），CBC 模式 IV 取 AESKey 前 16 字节，
 * PKCS#7 按 32 字节块补位（不是常见 AES 的 16）；信封明文结构 random(16B) +
 * msg_len(4B 网络字节序) + 消息体 + receiveId 尾部。msg_len 负值与越界、密文结构不符、
 * 密钥非法与补位非法一律抛出 {@link IllegalArgumentException}，由调用方按参数错误
 * 应答，不伪装成功。receiveId 的校验方式由调用方决定：expectedReceiveId 传期望值则
 * 解密即比对（钉钉 ownerKey 口径），传 null 则尾部原样交回调用方自行校验（小程序
 * AppID / 企微 corpId / 小红书 appId 口径）。
 */
public final class AesEnvelopeCodec {

    // AESKey 解出长度 32 字节（AES-256），补位与密文结构都按 32 字节块
    private static final int KEY_BYTES = 32;
    private static final int BLOCK_SIZE = 32;
    // 信封几何：random 16 字节 + msg_len 4 字节（大端），其后是消息体与 receiveId 尾部
    private static final int RANDOM_BYTES = 16;
    private static final int LENGTH_FIELD_BYTES = 4;
    private static final int MESSAGE_OFFSET = RANDOM_BYTES + LENGTH_FIELD_BYTES;
    private static final String CIPHER_TRANSFORMATION = "AES/CBC/NoPadding";
    private static final String KEY_ALGORITHM = "AES";
    // IV 取 AESKey 前 16 字节（同族实现口径）
    private static final int IV_BYTES = 16;

    private AesEnvelopeCodec() {
    }

    // 解密产物：message 为信封内消息体，receiveId 为信封尾部归属标识
    public record Plain(String message, String receiveId) {
    }

    /**
     * EncodingAESKey（官方固定 43 位，a-z A-Z 0-9）补 "=" 解码为 AESKey；缺失、位数
     * 不符、非 Base64 与解出长度不符都抛出 {@link IllegalArgumentException}。
     *
     * @param encodingAesKey 渠道配置的 EncodingAESKey
     * @return AES-256 密钥
     */
    public static SecretKeySpec decodeKey(String encodingAesKey) {
        if (encodingAesKey == null || encodingAesKey.isEmpty()) {
            throw new IllegalArgumentException("渠道未配置消息加解密密钥");
        }
        // 官方规格：EncodingAESKey 固定 43 位，补 "=" 解出 32 字节（企微族统一口径）
        if (encodingAesKey.length() != 43) {
            throw new IllegalArgumentException("EncodingAESKey 须为 43 位");
        }
        byte[] key;
        try {
            key = Base64.getDecoder().decode(encodingAesKey + "=");
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("EncodingAESKey 不是合法 Base64", e);
        }
        if (key.length != KEY_BYTES) {
            throw new IllegalArgumentException("EncodingAESKey 解出密钥长度不符");
        }
        return new SecretKeySpec(key, KEY_ALGORITHM);
    }

    /**
     * 解密信封：Base64 → AES-256-CBC → 去 32 字节块 PKCS#7 → 按 16+4 头切出消息体与
     * receiveId 尾部；expectedReceiveId 非空时解密即比对，不一致抛参数错误。
     *
     * @param key               {@link #decodeKey} 解出的 AESKey
     * @param ciphertext        密文（Base64）
     * @param expectedReceiveId 期望的尾部归属标识，null 表示交由调用方校验
     * @return 消息体与 receiveId 尾部
     */
    public static Plain decrypt(SecretKeySpec key, String ciphertext, String expectedReceiveId) {
        byte[] unpadded = unpad(cipher(Cipher.DECRYPT_MODE, key, decodeBase64(ciphertext)));
        if (unpadded.length < MESSAGE_OFFSET) {
            throw new IllegalArgumentException("解密包过短：不足 16+4 字节头");
        }
        // msg_len 为 4 字节网络字节序（大端）；高位置 1 时 int 为负，与越界一并拒绝，
        // 避免按负长度截取报文；越界用减法比较，msg_len 接近 int 上限时加法会回绕为负绕过
        int messageLength = ((unpadded[RANDOM_BYTES] & 0xFF) << 24) | ((unpadded[RANDOM_BYTES + 1] & 0xFF) << 16)
            | ((unpadded[RANDOM_BYTES + 2] & 0xFF) << 8) | (unpadded[RANDOM_BYTES + 3] & 0xFF);
        if (messageLength < 0 || messageLength > unpadded.length - MESSAGE_OFFSET) {
            throw new IllegalArgumentException("msg_len 非法（负值或超出解密结果长度）");
        }
        String receiveId = new String(unpadded, MESSAGE_OFFSET + messageLength,
            unpadded.length - MESSAGE_OFFSET - messageLength, StandardCharsets.UTF_8);
        if (expectedReceiveId != null && !receiveId.equals(expectedReceiveId)) {
            throw new IllegalArgumentException("ReceiveId 校验错误：期望 " + expectedReceiveId
                + "，实际 " + receiveId);
        }
        return new Plain(new String(unpadded, MESSAGE_OFFSET, messageLength, StandardCharsets.UTF_8), receiveId);
    }

    /**
     * 加密信封：random(16B) + msg_len(4B 大端) + 消息体 + receiveId 拼装后按 32 字节块
     * PKCS#7 补齐，AES-256-CBC 加密取 Base64。
     *
     * @param key       {@link #decodeKey} 解出的 AESKey
     * @param random16  16 字节随机前缀
     * @param message   消息体明文字节
     * @param receiveId 尾部归属标识字节
     * @return 密文（Base64）
     */
    public static String encrypt(SecretKeySpec key, byte[] random16, byte[] message, byte[] receiveId) {
        if (random16 == null || random16.length != RANDOM_BYTES) {
            throw new IllegalArgumentException("加密随机数须为 16 字节");
        }
        byte[] full = new byte[MESSAGE_OFFSET + message.length + receiveId.length];
        System.arraycopy(random16, 0, full, 0, RANDOM_BYTES);
        int messageLength = message.length;
        full[RANDOM_BYTES] = (byte) (messageLength >>> 24);
        full[RANDOM_BYTES + 1] = (byte) (messageLength >>> 16);
        full[RANDOM_BYTES + 2] = (byte) (messageLength >>> 8);
        full[RANDOM_BYTES + 3] = (byte) messageLength;
        System.arraycopy(message, 0, full, MESSAGE_OFFSET, messageLength);
        System.arraycopy(receiveId, 0, full, MESSAGE_OFFSET + messageLength, receiveId.length);
        // PKCS#7：缺几个字节就补几个值为该字节数的填充，整块补齐时补一整块
        int padding = BLOCK_SIZE - full.length % BLOCK_SIZE;
        byte[] padded = Arrays.copyOf(full, full.length + padding);
        Arrays.fill(padded, full.length, padded.length, (byte) padding);
        return Base64.getEncoder().encodeToString(cipher(Cipher.ENCRYPT_MODE, key, padded));
    }

    // AES-256-CBC，IV 取 AESKey 前 16 字节；解密侧 NoPadding，补位由解密入口手工校验
    private static byte[] cipher(int mode, SecretKeySpec key, byte[] input) {
        try {
            Cipher cipher = Cipher.getInstance(CIPHER_TRANSFORMATION);
            cipher.init(mode, key, new IvParameterSpec(key.getEncoded(), 0, IV_BYTES));
            return cipher.doFinal(input);
        } catch (GeneralSecurityException e) {
            // 密钥/补位外的失败只有输入形状不合法（如长度非块整数倍），统一按参数错误拒绝
            throw new IllegalArgumentException("AES 信封运算失败", e);
        }
    }

    // 密文 Base64 解码：坏字符与残位即拒绝，不给调用方看似合法的明文
    private static byte[] decodeBase64(String ciphertext) {
        if (ciphertext == null || ciphertext.isEmpty()) {
            throw new IllegalArgumentException("密文为空");
        }
        try {
            return Base64.getDecoder().decode(ciphertext);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("密文不是合法 Base64", e);
        }
    }

    // 末字节即补位长度：逐字节核对填充值，防止被裁剪的密文伪装成合法明文
    private static byte[] unpad(byte[] padded) {
        if (padded.length == 0) {
            throw new IllegalArgumentException("PKCS#7 补位非法");
        }
        int padding = padded[padded.length - 1] & 0xFF;
        if (padding < 1 || padding > BLOCK_SIZE || padding > padded.length) {
            throw new IllegalArgumentException("PKCS#7 补位非法");
        }
        for (int index = padded.length - padding; index < padded.length; index++) {
            if (padded[index] != (byte) padding) {
                throw new IllegalArgumentException("PKCS#7 补位非法");
            }
        }
        return Arrays.copyOf(padded, padded.length - padding);
    }
}
