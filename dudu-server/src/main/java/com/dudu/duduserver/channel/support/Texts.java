package com.dudu.duduserver.channel.support;

/**
 * 渠道协议层的字符串判空口径：null 与空白串一律收敛为 null——访客身份、消息正文
 * 等可选字段据此区分「渠道未下发」与「值为空」，与 ChannelInfoText 对 channel_info
 * 值的读取同源。
 */
public final class Texts {

    private Texts() {
    }

    public static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    public static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    // 依次取第一个非空白原值；全空白返回 null，与 blankToNull 同口径
    public static String firstNonBlank(String... values) {
        for (String value : values) {
            if (!isBlank(value)) {
                return value;
            }
        }
        return null;
    }
}
