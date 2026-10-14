package com.dudu.duduserver.channel.wechatmini;

import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.Arrays;
import java.util.Base64;

/**
 * 小程序回调报文 AES 加解密（官方 WXBizMsgCrypt 同族，事实见
 * docs/research/channels/wechat-mini.md §4.3）：AESKey = Base64_Decode(EncodingAESKey + "=")
 * 解出 32 字节，CBC 模式，IV 取 AESKey 前 16 字节（官方页未明示，官方加密算例按此逐字节
 * 复算坐实），PKCS#7 补位 K 取密钥字节数 32；明文结构 random(16B) + msg_len(4B 网络字节序)
 * + msg + appid，尾部 appid 由调用方校验与本小程序一致。解密失败、密文结构不符与密钥非法
 * 都抛出 {@link IllegalArgumentException}，由调用方按参数错误应答，不伪装成功。
 */
@Component
public class WechatMiniCrypto {

    private static final String CIPHER_TRANSFORMATION = "AES/CBC/NoPadding";
    private static final String KEY_ALGORITHM = "AES";
    private static final int KEY_LENGTH = 32;
    private static final int BLOCK_SIZE = 32;
    private static final int RANDOM_LENGTH = 16;
    private static final int LENGTH_FIELD_BYTES = 4;
    // random + msg_len 的固定头部长度，msg 从这里开始
    private static final int MESSAGE_OFFSET = RANDOM_LENGTH + LENGTH_FIELD_BYTES;

    // 解密结果：message 为回调解密后的报文，appId 为明文尾部的来源小程序 AppID
    public record PlainMessage(String message, String appId) {
    }

    public PlainMessage decrypt(String encodingAesKey, String ciphertext) {
        byte[] padded = decryptToBytes(aesKey(encodingAesKey), ciphertext);
        byte[] full = stripPadding(padded);
        if (full.length <= MESSAGE_OFFSET) {
            throw new IllegalArgumentException("回调密文结构不符合约定");
        }
        byte[] messageBytes = Arrays.copyOfRange(full, MESSAGE_OFFSET,
            MESSAGE_OFFSET + messageLength(full));
        byte[] appIdBytes = Arrays.copyOfRange(full, MESSAGE_OFFSET + messageLength(full), full.length);
        return new PlainMessage(new String(messageBytes, StandardCharsets.UTF_8),
            new String(appIdBytes, StandardCharsets.UTF_8));
    }

    // 官方加密回复算例同款封装：random 16 字节 + msg + appId 拼装后补位加密
    public String encrypt(String encodingAesKey, byte[] random, String message, String appId) {
        if (random == null || random.length != RANDOM_LENGTH) {
            throw new IllegalArgumentException("加密随机数须为 16 字节");
        }
        byte[] messageBytes = message.getBytes(StandardCharsets.UTF_8);
        byte[] appIdBytes = appId.getBytes(StandardCharsets.UTF_8);
        byte[] full = new byte[MESSAGE_OFFSET + messageBytes.length + appIdBytes.length];
        System.arraycopy(random, 0, full, 0, RANDOM_LENGTH);
        int messageLength = messageBytes.length;
        full[RANDOM_LENGTH] = (byte) (messageLength >>> 24);
        full[RANDOM_LENGTH + 1] = (byte) (messageLength >>> 16);
        full[RANDOM_LENGTH + 2] = (byte) (messageLength >>> 8);
        full[RANDOM_LENGTH + 3] = (byte) messageLength;
        System.arraycopy(messageBytes, 0, full, MESSAGE_OFFSET, messageLength);
        System.arraycopy(appIdBytes, 0, full, MESSAGE_OFFSET + messageLength, appIdBytes.length);

        // PKCS#7：缺几个字节就补几个值为该字节数的填充，整块补齐时补一整块
        int padding = BLOCK_SIZE - full.length % BLOCK_SIZE;
        byte[] padded = Arrays.copyOf(full, full.length + padding);
        Arrays.fill(padded, full.length, padded.length, (byte) padding);
        return encryptToBase64(aesKey(encodingAesKey), padded);
    }

    private byte[] decryptToBytes(SecretKeySpec key, String ciphertext) {
        try {
            Cipher cipher = Cipher.getInstance(CIPHER_TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, iv(key));
            return cipher.doFinal(Base64.getDecoder().decode(ciphertext));
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw new IllegalArgumentException("回调密文无法解密", e);
        }
    }

    private String encryptToBase64(SecretKeySpec key, byte[] padded) {
        try {
            Cipher cipher = Cipher.getInstance(CIPHER_TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key, iv(key));
            return Base64.getEncoder().encodeToString(cipher.doFinal(padded));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("回调报文加密失败", e);
        }
    }

    // 尾字节即填充长度：逐字节核对填充值，防止被裁剪的密文伪装成合法明文
    private byte[] stripPadding(byte[] padded) {
        if (padded.length == 0 || padded.length % 16 != 0) {
            throw new IllegalArgumentException("回调密文结构不符合约定");
        }
        int padding = padded[padded.length - 1] & 0xFF;
        if (padding < 1 || padding > BLOCK_SIZE || padded.length - padding < MESSAGE_OFFSET) {
            throw new IllegalArgumentException("回调密文结构不符合约定");
        }
        for (int index = padded.length - padding; index < padded.length; index++) {
            if (padded[index] != (byte) padding) {
                throw new IllegalArgumentException("回调密文无法解密");
            }
        }
        return Arrays.copyOfRange(padded, 0, padded.length - padding);
    }

    // msg_len 为 4 字节网络字节序（大端）
    private int messageLength(byte[] full) {
        int messageLength = ((full[RANDOM_LENGTH] & 0xFF) << 24) | ((full[RANDOM_LENGTH + 1] & 0xFF) << 16)
            | ((full[RANDOM_LENGTH + 2] & 0xFF) << 8) | (full[RANDOM_LENGTH + 3] & 0xFF);
        if (messageLength < 0 || MESSAGE_OFFSET + messageLength > full.length) {
            throw new IllegalArgumentException("回调密文结构不符合约定");
        }
        return messageLength;
    }

    private SecretKeySpec aesKey(String encodingAesKey) {
        if (encodingAesKey == null || encodingAesKey.isEmpty()) {
            throw new IllegalArgumentException("渠道未配置消息加解密密钥");
        }
        // 官方规格：EncodingAESKey 固定 43 位，补 "=" 解出 32 字节（与企微族四实现统一口径）
        if (encodingAesKey.length() != 43) {
            throw new IllegalArgumentException("EncodingAESKey 须为 43 位");
        }
        byte[] key;
        try {
            key = Base64.getDecoder().decode(encodingAesKey + "=");
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("EncodingAESKey 不是合法 Base64", e);
        }
        if (key.length != KEY_LENGTH) {
            throw new IllegalArgumentException("EncodingAESKey 解出密钥长度不符");
        }
        return new SecretKeySpec(key, KEY_ALGORITHM);
    }

    // 同族实现口径：IV 为 AESKey 前 16 字节
    private IvParameterSpec iv(SecretKeySpec key) {
        return new IvParameterSpec(key.getEncoded(), 0, RANDOM_LENGTH);
    }
}
