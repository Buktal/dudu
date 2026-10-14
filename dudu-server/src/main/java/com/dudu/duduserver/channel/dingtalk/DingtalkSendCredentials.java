package com.dudu.duduserver.channel.dingtalk;

import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Map;

/**
 * 钉钉发送侧凭据：工作通知（asyncsend_v2）所需 appKey/appSecret/agentId，键名沿
 * MockPulse appKey 语义与公众号 appSecret 先例（事实库 §5.11 实施假设）；缺失任一
 * 返回 null，由适配器如实给出「渠道发送凭据未配置」；凭据不写入日志也不返回给 Desk。
 */
public record DingtalkSendCredentials(String appKey, String appSecret, String agentId) {

    private static final String INFO_APP_KEY = "appKey";
    private static final String INFO_APP_SECRET = "appSecret";
    private static final String INFO_AGENT_ID = "agentId";

    public static DingtalkSendCredentials of(CompanyChannelDO account) {
        Map<String, Object> info = account == null ? null : account.getChannelInfo();
        String appKey = text(info, INFO_APP_KEY);
        String appSecret = text(info, INFO_APP_SECRET);
        String agentId = text(info, INFO_AGENT_ID);
        return appKey == null || appSecret == null || agentId == null
            ? null
            : new DingtalkSendCredentials(appKey, appSecret, agentId);
    }

    private static String text(Map<String, Object> info, String key) {
        Object value = info == null ? null : info.get(key);
        return value instanceof String text && !text.isBlank() ? text : null;
    }
}
