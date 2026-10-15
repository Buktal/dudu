package com.dudu.duduserver.channel.support;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Locale;

/**
 * 渠道验签共用摘要小工具：digest → 小写 hex、HMAC 与常量时间比对。签名核对属验签
 * 口径的一部分，比对一律走 {@link #constantTimeEquals}，不用 equals；摘要算法取 JVM
 * 必带实现，缺失属运行环境错误按 {@link IllegalStateException} 抛出。
 */
public final class Digests {

    private static final String SHA1 = "SHA-1";
    private static final String SHA256 = "SHA-256";
    private static final String MD5 = "MD5";
    private static final String HMAC_SHA256 = "HmacSHA256";

    private Digests() {
    }

    // UTF-8 字节的 SHA-1 摘要小写 hex（企微族三参/四参验签、抖音签名口径）
    public static String sha1Hex(String value) {
        return hex(SHA1, value.getBytes(StandardCharsets.UTF_8));
    }

    // 字节的 SHA-1 摘要小写 hex（签名材料为「前缀串 + 原始 body 字节」拼接时用）
    public static String sha1Hex(byte[] input) {
        return hex(SHA1, input);
    }

    // 字节的 SHA-256 摘要小写 hex（飞书签名口径）
    public static String sha256Hex(byte[] input) {
        return hex(SHA256, input);
    }

    // UTF-8 字节的 MD5 摘要小写 hex（美团「MD5 加密得 32 位签名，字母小写」口径）
    public static String md5Hex(String value) {
        return hex(MD5, value.getBytes(StandardCharsets.UTF_8));
    }

    // HMAC-SHA256 字节流（WhatsApp 推送验签：key=appSecret、msg=原始 body 字节）
    public static byte[] hmacSha256(byte[] key, byte[] message) {
        try {
            Mac mac = Mac.getInstance(HMAC_SHA256);
            mac.init(new SecretKeySpec(key, HMAC_SHA256));
            return mac.doFinal(message);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("当前运行环境缺少 HMAC-SHA256 实现", e);
        }
    }

    // 常量时间比对（验签用）：等长时耗时与内容无关，不给时序侧信道留口子
    public static boolean constantTimeEquals(byte[] expected, byte[] received) {
        return MessageDigest.isEqual(expected, received);
    }

    // 摘要 hex 与验签 token 的字符串比对：先归一小写（渠道摘要统一小写 hex 口径，
    // 大写推文不误拒）再常量时间比对；null 一律 false
    public static boolean constantTimeEquals(String expected, String received) {
        return expected != null && received != null
            && MessageDigest.isEqual(expected.toLowerCase(Locale.ROOT).getBytes(StandardCharsets.UTF_8),
                received.toLowerCase(Locale.ROOT).getBytes(StandardCharsets.UTF_8));
    }

    // 摘要统一转小写 hex
    private static String hex(String algorithm, byte[] input) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance(algorithm).digest(input));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("当前运行环境缺少 " + algorithm + " 实现", e);
        }
    }
}
