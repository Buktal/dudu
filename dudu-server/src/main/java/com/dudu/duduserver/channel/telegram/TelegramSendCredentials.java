package com.dudu.duduserver.channel.telegram;

import com.dudu.duduserver.channel.support.ChannelInfoText;
import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Map;

/**
 * Telegram 发送侧凭据：含 {@code /bot<token>} 路径段的 Bot API 基址（事实见
 * docs/research/channels/telegram.md §5，token 走 URL 路径鉴权），sendMessage 与
 * getFile/下载同源派生，文本发送与媒体读取共用。沿用钉钉/WhatsApp 先例在回调凭据之外
 * 单列发送组——secretToken 只服务回调恒等头比对，url 只服务出站请求，两侧互不依赖
 * （ADR-0013：channel_info 按渠道记录收窄）。键名 `url` 与 mock-pulse config.rs 的
 * serde 键一致。缺失返回 null，由适配器如实给出「渠道发送/素材凭据未配置」；凭据不
 * 写入日志也不返回给 Desk。
 */
public record TelegramSendCredentials(String url) {

    private static final String INFO_URL = "url";

    public static TelegramSendCredentials of(CompanyChannelDO account) {
        Map<String, Object> info = account == null ? null : account.getChannelInfo();
        String url = ChannelInfoText.text(info, INFO_URL);
        return url == null ? null : new TelegramSendCredentials(url);
    }
}
