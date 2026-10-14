package com.dudu.duduserver.channel.whatsapp;

import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Map;

/**
 * WhatsApp 发送侧凭据：Messages API 与媒体下载所需的系统用户访问令牌与业务电话号码 ID
 * （官方 §5.3/§6，Authorization: Bearer <token> + POST /{version}/{phone_number_id}/messages）。
 * 键名 accessToken/phoneNumberId 为实施假设——mock-pulse config.rs 的 Whatsapp 变体只含
 * 回调三键（url/appSecret/verifyToken），不含发送侧材料，沿用钉钉发送凭据先例
 * （DingtalkSendCredentials）在回调键之外扩展。缺失任一返回 null，由适配器如实给出
 * 「渠道发送凭据未配置」；凭据不写入日志也不返回给 Desk。
 */
public record WhatsappSendCredentials(String accessToken, String phoneNumberId) {

    private static final String INFO_ACCESS_TOKEN = "accessToken";
    private static final String INFO_PHONE_NUMBER_ID = "phoneNumberId";

    public static WhatsappSendCredentials of(CompanyChannelDO account) {
        Map<String, Object> info = account == null ? null : account.getChannelInfo();
        String accessToken = text(info, INFO_ACCESS_TOKEN);
        String phoneNumberId = text(info, INFO_PHONE_NUMBER_ID);
        return accessToken == null || phoneNumberId == null
            ? null
            : new WhatsappSendCredentials(accessToken, phoneNumberId);
    }

    private static String text(Map<String, Object> info, String key) {
        Object value = info == null ? null : info.get(key);
        return value instanceof String text && !text.isBlank() ? text : null;
    }
}
