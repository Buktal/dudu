package com.dudu.duduserver.channel.support;

import java.util.Arrays;

/**
 * 微信回调验签共用口径（公众号/企业微信/小程序，事实见 docs/research/channels/wechat-mp.md、
 * wecom.md、wechat-mini.md）：参与验签的值字典序排序后直接拼接取 SHA-1 十六进制小写，再与
 * 渠道签名常量时间比对。三参（token/timestamp/nonce）用于公众号与小程序握手及明文推送，
 * 四参（再拼入报文密文）用于企业微信回调与小程序安全模式 msg_signature。入参有效性口径
 * 各渠道不同（null/空串判断与空白判断），留调用方把关，这里只收敛排序拼接与比对。
 */
public final class WechatSignatures {

    private WechatSignatures() {
    }

    // 三参 sha1 验签：token/timestamp/nonce 字典序排序拼接取 sha1 小写 hex，与渠道签名常量时间比对
    public static boolean verifySha1(String signature, String token, String timestamp, String nonce) {
        return matches(signature, new String[] {token, timestamp, nonce});
    }

    // 四参 sha1 验签：token/timestamp/nonce/密文字典序排序拼接取 sha1 小写 hex，与 msg_signature 常量时间比对
    public static boolean verifySha1(String signature, String token, String timestamp, String nonce, String encrypt) {
        return matches(signature, new String[] {token, timestamp, nonce, encrypt});
    }

    // 排序拼接与比对共用：数组由调用方按参位数新建，可就地排序
    private static boolean matches(String signature, String[] parts) {
        Arrays.sort(parts);
        return Digests.constantTimeEquals(Digests.sha1Hex(String.join("", parts)), signature);
    }
}
