package com.dudu.duduserver.channel.telegram;

import com.dudu.duduserver.channel.support.ChannelInfoText;
import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Map;

/**
 * Telegram 回调凭据：webhook 推送恒等头比对用的 secret_token（事实见
 * docs/research/channels/telegram.md §4.1，POST Update 的
 * {@code X-Telegram-Bot-Api-Secret-Token} 头与配置值常量时间比对）。键名与 mock-pulse
 * config.rs Telegram 变体的 serde 键一致（`secretToken`，camelCase）——缺失按该账号未
 * 配置返回 null；发送侧完整凭据见 {@link TelegramSendCredentials}。凭据不写入日志也
 * 不返回给 Desk。
 */
public record TelegramCredentials(String secretToken) {

    private static final String INFO_SECRET_TOKEN = "secretToken";

    public static TelegramCredentials of(CompanyChannelDO account) {
        Map<String, Object> info = account == null ? null : account.getChannelInfo();
        String secretToken = ChannelInfoText.text(info, INFO_SECRET_TOKEN);
        return secretToken == null ? null : new TelegramCredentials(secretToken);
    }
}
