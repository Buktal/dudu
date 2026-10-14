package com.dudu.duduserver.channel.meituan;

import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Map;

/**
 * 美团渠道凭据：技术服务合作中心的 app_id 与 app secret（consumer_secret，§6），键名与
 * mock-pulse config.rs Meituan 变体一致（均无缺省，缺一按该账号未配置返回 null）；回调
 * 验签与消息发送共用，凭据不写入日志也不返回给 Desk。
 */
public record MeituanCredentials(String appId, String appSecret) {

    private static final String INFO_APP_ID = "app_id";
    private static final String INFO_APP_SECRET = "app_secret";

    public static MeituanCredentials of(CompanyChannelDO account) {
        Map<String, Object> info = account == null ? null : account.getChannelInfo();
        String appId = text(info, INFO_APP_ID);
        String appSecret = text(info, INFO_APP_SECRET);
        return appId == null || appSecret == null ? null : new MeituanCredentials(appId, appSecret);
    }

    private static String text(Map<String, Object> info, String key) {
        Object value = info == null ? null : info.get(key);
        return value instanceof String text && !text.isBlank() ? text : null;
    }
}
