package com.dudu.duduserver.channel.dingtalk;

import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Map;

/**
 * 钉钉回调加解密三元组凭据：从 company_channel.channel_info 读取，键与 MockPulse
 * config.rs 一致（url/system/token/encodingAesKey/ownerKey，事实库 §5.11 对拍基线）；
 * system 标识推送通道，本票唯一形态为新 HTTP 密文信封（http_crypto 缺省）。token、
 * encodingAesKey 与 ownerKey 任一缺失整组返回 null（「该账号未配置」语义，ADR-0013）；
 * 凭据不写入日志也不返回给 Desk。
 */
public record DingtalkCredentials(String url, String system, String token, String encodingAesKey, String ownerKey) {

    private static final String INFO_URL = "url";
    private static final String INFO_SYSTEM = "system";
    private static final String INFO_TOKEN = "token";
    private static final String INFO_ENCODING_AES_KEY = "encodingAesKey";
    private static final String INFO_OWNER_KEY = "ownerKey";
    private static final String SYSTEM_HTTP_CRYPTO = "http_crypto";

    public static DingtalkCredentials of(CompanyChannelDO account) {
        Map<String, Object> info = account == null ? null : account.getChannelInfo();
        String token = text(info, INFO_TOKEN);
        String encodingAesKey = text(info, INFO_ENCODING_AES_KEY);
        String ownerKey = text(info, INFO_OWNER_KEY);
        if (token == null || encodingAesKey == null || ownerKey == null) {
            return null;
        }
        // url 仅为配置自描述（推送目标），system 缺省本票唯一形态
        String url = text(info, INFO_URL);
        String system = text(info, INFO_SYSTEM);
        return new DingtalkCredentials(url, system == null ? SYSTEM_HTTP_CRYPTO : system, token, encodingAesKey,
            ownerKey);
    }

    private static String text(Map<String, Object> info, String key) {
        Object value = info == null ? null : info.get(key);
        return value instanceof String text && !text.isBlank() ? text : null;
    }
}
