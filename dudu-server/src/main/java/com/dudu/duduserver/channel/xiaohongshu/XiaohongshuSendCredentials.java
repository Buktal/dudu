package com.dudu.duduserver.channel.xiaohongshu;

import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Map;

/**
 * 小红书发送凭据：从 company_channel.channel_info 读取 appId 与 appSecret，用于换取
 * access_token（事实见 docs/research/channels/xiaohongshu.md §12.2；mock 连接配置不含
 * appSecret——它不模拟 token 换取，服务端按 wechat-mini 先例补入，§12.5 口径）；
 * 缺失任一返回 null，凭据不写入日志也不返回给 Desk。回调凭据（token/encodingAesKey/appId）
 * 另见 {@link XiaohongshuCredentials}，两套互不混用。
 */
public record XiaohongshuSendCredentials(String appId, String appSecret) {

    private static final String INFO_APP_ID = "appId";
    private static final String INFO_APP_SECRET = "appSecret";

    public static XiaohongshuSendCredentials of(CompanyChannelDO account) {
        Map<String, Object> info = account == null ? null : account.getChannelInfo();
        String appId = text(info, INFO_APP_ID);
        String appSecret = text(info, INFO_APP_SECRET);
        return appId == null || appSecret == null ? null : new XiaohongshuSendCredentials(appId, appSecret);
    }

    private static String text(Map<String, Object> info, String key) {
        Object value = info == null ? null : info.get(key);
        return value instanceof String text && !text.isBlank() ? text : null;
    }
}
