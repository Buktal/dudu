package com.dudu.duduserver.channel.support;

import java.util.Map;

/**
 * channel_info 值读取的统一口径：只取非空字符串，缺失、非字符串与空白一律 null
 * （各渠道凭据据此判定「该账号未配置」，见各 Credentials.of）。
 */
public final class ChannelInfoText {

    private ChannelInfoText() {
    }

    // 值存在且为非空字符串才有配置；其余形态按缺失处理
    public static String text(Map<String, Object> info, String key) {
        Object value = info == null ? null : info.get(key);
        return value instanceof String text && !text.isBlank() ? text : null;
    }
}
