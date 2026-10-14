package com.dudu.duduserver.channel.feishu;

import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Map;

/**
 * 飞书渠道凭据（事实见 docs/research/channels/feishu.md §4、§6）：从
 * company_channel.channel_info 读取 appId 与 appSecret（换取 tenant_access_token，
 * 发送与素材读取共用）、verificationToken（事件明文比对）与 encryptKey（可选，
 * 空 = 明文模式，配置后签名验签与 AES 解密）；任一必填键缺失返回 null，
 * 凭据不写入日志也不返回给 Desk。
 */
public record FeishuCredentials(String appId, String appSecret, String verificationToken, String encryptKey) {

    // channel_info 键名与开发者后台「凭证与基础信息 / 加密策略」页字段一一对应
    private static final String INFO_APP_ID = "appId";
    private static final String INFO_APP_SECRET = "appSecret";
    private static final String INFO_VERIFICATION_TOKEN = "verificationToken";
    private static final String INFO_ENCRYPT_KEY = "encryptKey";

    public static FeishuCredentials of(CompanyChannelDO account) {
        Map<String, Object> info = account == null ? null : account.getChannelInfo();
        String appId = text(info, INFO_APP_ID);
        String appSecret = text(info, INFO_APP_SECRET);
        String verificationToken = text(info, INFO_VERIFICATION_TOKEN);
        if (appId == null || appSecret == null || verificationToken == null) {
            return null;
        }
        // encryptKey 可选：缺失即明文模式（官方 §4.1 默认低安全形态）
        return new FeishuCredentials(appId, appSecret, verificationToken, text(info, INFO_ENCRYPT_KEY));
    }

    private static String text(Map<String, Object> info, String key) {
        Object value = info == null ? null : info.get(key);
        return value instanceof String text && !text.isBlank() ? text : null;
    }
}
