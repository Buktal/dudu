package com.dudu.duduserver.channel.telegram;

import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Map;

/**
 * Telegram 渠道凭据：webhook 接收地址与恒等头比对用的 secret_token（事实见
 * docs/research/channels/telegram.md §4.1），键名与 mock-pulse config.rs Telegram 变体
 * 的 serde 键一致（`url`/`secretToken`，camelCase，两字段均无缺省）——缺一按该账号未
 * 配置返回 null；凭据不写入日志也不返回给 Desk。
 */
public record TelegramCredentials(String url, String secretToken) {

    private static final String INFO_URL = "url";
    private static final String INFO_SECRET_TOKEN = "secretToken";

    public static TelegramCredentials of(CompanyChannelDO account) {
        Map<String, Object> info = account == null ? null : account.getChannelInfo();
        String url = text(info, INFO_URL);
        String secretToken = text(info, INFO_SECRET_TOKEN);
        return url == null || secretToken == null ? null : new TelegramCredentials(url, secretToken);
    }

    private static String text(Map<String, Object> info, String key) {
        Object value = info == null ? null : info.get(key);
        return value instanceof String text && !text.isBlank() ? text : null;
    }
}
