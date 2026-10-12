package com.dudu.duduserver.channel;

import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Map;

/**
 * 公众号发送凭据：从 company_channel.channel_info 读取 appId 与 appSecret，用于换取
 * access_token（事实见 docs/research/channels/wechat-mp.md §6）；缺失任一返回 null，
 * 凭据不写入日志也不返回给 Desk。
 */
public record WechatMpSendCredentials(String appId, String appSecret) {

    private static final String INFO_APP_ID = "appId";
    private static final String INFO_APP_SECRET = "appSecret";

    public static WechatMpSendCredentials of(CompanyChannelDO account) {
        Map<String, Object> info = account == null ? null : account.getChannelInfo();
        String appId = text(info, INFO_APP_ID);
        String appSecret = text(info, INFO_APP_SECRET);
        return appId == null || appSecret == null ? null : new WechatMpSendCredentials(appId, appSecret);
    }

    private static String text(Map<String, Object> info, String key) {
        Object value = info == null ? null : info.get(key);
        return value instanceof String text && !text.isBlank() ? text : null;
    }
}
