package com.dudu.duduserver.channel.xiaohongshu;

import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Map;

/**
 * 小红书回调凭据：从 company_channel.channel_info 读取 token、encodingAesKey 与 appId，
 * 用于握手验签与推送验签、消息解密（键名与 mock-pulse config.rs Xiaohongshu 变体一致，
 * 事实见 docs/research/channels/xiaohongshu.md §10.2/§11.2）；url 与 system 为 mock 侧
 * 连接键，服务端不读取；缺失任一返回 null（按「该账号未配置」处理），凭据不写入日志也不
 * 返回给 Desk。
 */
public record XiaohongshuCredentials(String token, String encodingAesKey, String appId) {

    private static final String INFO_TOKEN = "token";
    private static final String INFO_ENCODING_AES_KEY = "encodingAesKey";
    private static final String INFO_APP_ID = "appId";

    public static XiaohongshuCredentials of(CompanyChannelDO account) {
        Map<String, Object> info = account == null ? null : account.getChannelInfo();
        String token = text(info, INFO_TOKEN);
        String encodingAesKey = text(info, INFO_ENCODING_AES_KEY);
        String appId = text(info, INFO_APP_ID);
        return token == null || encodingAesKey == null || appId == null
            ? null
            : new XiaohongshuCredentials(token, encodingAesKey, appId);
    }

    private static String text(Map<String, Object> info, String key) {
        Object value = info == null ? null : info.get(key);
        return value instanceof String text && !text.isBlank() ? text : null;
    }
}
