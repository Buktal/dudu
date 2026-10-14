package com.dudu.duduserver.channel.whatsapp;

import com.dudu.duduserver.channel.support.ChannelInfoText;
import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Map;

/**
 * WhatsApp 回调凭据：从 company_channel.channel_info 收窄读取，键与 mock-pulse
 * config.rs Whatsapp 变体一致（url/appSecret/verifyToken，camelCase，三字段均必填）。
 * 三值各司其职（事实见 docs/research/channels/whatsapp.md §3.2/§4.1）：verifyToken 只
 * 参与 GET 三参握手比对，appSecret 只作 POST 验签的 HMAC-SHA256 密钥，两者是无关值；
 * url 为回调地址配置自描述。任一缺失整组返回 null，由调用方按「该账号未配置」处理
 * （ADR-0013）；凭据不写入日志也不返回给 Desk。
 */
public record WhatsappCredentials(String url, String appSecret, String verifyToken) {

    private static final String INFO_URL = "url";
    private static final String INFO_APP_SECRET = "appSecret";
    private static final String INFO_VERIFY_TOKEN = "verifyToken";

    public static WhatsappCredentials of(CompanyChannelDO account) {
        Map<String, Object> info = account == null ? null : account.getChannelInfo();
        String url = ChannelInfoText.text(info, INFO_URL);
        String appSecret = ChannelInfoText.text(info, INFO_APP_SECRET);
        String verifyToken = ChannelInfoText.text(info, INFO_VERIFY_TOKEN);
        return url == null || appSecret == null || verifyToken == null
            ? null
            : new WhatsappCredentials(url, appSecret, verifyToken);
    }
}
