package com.dudu.duduserver.channel.support;

import java.util.Arrays;

/**
 * 微信回调验签共用口径（公众号/企业微信/小程序，事实见 docs/research/channels/wechat-mp.md、
 * wecom.md、wechat-mini.md）：参与验签的值字典序排序后直接拼接取 SHA-1 十六进制小写，再与
 * 渠道签名常量时间比对。三参（token/timestamp/nonce）用于公众号与小程序握手及明文推送，
 * 四参（再拼入报文密文）用于企业微信回调与小程序安全模式 msg_signature。任一材料缺失或
 * 空白都直接判验签失败（sha1OfSorted 遇 null 会 NPE，守卫收敛在此单点），调用方不再
 * 各自把关。
 *
 * <p>类名沿用微信族起点，但承载的是通用「字典序排序拼接 sha1 + 常量时间比对」验签原语：
 * 微博（appsecret/timestamp/nonce 三参）、小红书（三参握手与四参信封）与钉钉（四参
 * 加签）的验签/签名同式，直接复用本类，不另建副本。
 */
public final class WechatSignatures {

    private WechatSignatures() {
    }

    // 三参 sha1 验签：token/timestamp/nonce 字典序排序拼接取 sha1 小写 hex，与渠道签名常量时间比对
    public static boolean verifySha1(String signature, String token, String timestamp, String nonce) {
        if (Texts.isBlank(signature) || Texts.isBlank(token) || Texts.isBlank(timestamp) || Texts.isBlank(nonce)) {
            return false;
        }
        return Digests.constantTimeEquals(sha1OfSorted(token, timestamp, nonce), signature);
    }

    // 四参 sha1 验签：token/timestamp/nonce/密文字典序排序拼接取 sha1 小写 hex，与 msg_signature 常量时间比对
    public static boolean verifySha1(String signature, String token, String timestamp, String nonce, String encrypt) {
        if (Texts.isBlank(signature) || Texts.isBlank(token) || Texts.isBlank(timestamp) || Texts.isBlank(nonce)
            || Texts.isBlank(encrypt)) {
            return false;
        }
        return Digests.constantTimeEquals(sha1OfSorted(token, timestamp, nonce, encrypt), signature);
    }

    // 通用原语的产生侧：任意参数字典序排序拼接取 sha1 小写 hex（钉钉加密签名等复用）
    public static String sha1OfSorted(String... parts) {
        Arrays.sort(parts);
        return Digests.sha1Hex(String.join("", parts));
    }
}
