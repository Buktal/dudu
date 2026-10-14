package com.dudu.duduserver.channel.wecom;

import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Map;

/**
 * 企业微信渠道凭据，从 company_channel.channel_info 收窄读取（键对照 mock-pulse
 * config.rs ConnectionConfig::Wecom 的 serde 键，camelCase）：回调材料 corpId/token/
 * encodingAesKey 用于验签与解密（官方 §3.2/§3.3），接口凭据 corpId/corpSecret/agentId
 * 用于换取 access_token 与应用消息寻址（corpSecret 为发送侧凭据，按公众号 appId/appSecret
 * 先例补入 channel_info）。缺失必需字段返回 null，由调用方按「该账号未配置」处理；
 * 凭据不写入日志也不返回给 Desk。
 */
public record WecomCredentials(String corpId, String corpSecret, String agentId) {

    // 回调验签与解密的材料（system/url 随配置保存，不参与验签）
    public record CallbackKey(String corpId, String token, String encodingAesKey) {
    }

    private static final String INFO_CORP_ID = "corpId";
    private static final String INFO_CORP_SECRET = "corpSecret";
    private static final String INFO_AGENT_ID = "agentId";
    private static final String INFO_TOKEN = "token";
    private static final String INFO_ENCODING_AES_KEY = "encodingAesKey";

    /**
     * 接口凭据：换取 access_token 需 corpId/corpSecret（官方 91039），应用消息寻址需
     * agentId（官方 90236）；缺失任一返回 null。
     */
    public static WecomCredentials of(CompanyChannelDO account) {
        Map<String, Object> info = info(account);
        String corpId = text(info, INFO_CORP_ID);
        String corpSecret = text(info, INFO_CORP_SECRET);
        String agentId = text(info, INFO_AGENT_ID);
        return corpId == null || corpSecret == null || agentId == null
            ? null
            : new WecomCredentials(corpId, corpSecret, agentId);
    }

    /**
     * 回调材料：验签与解密需要 token/encodingAesKey，解密尾部 receiveid 与 corpId 校验；
     * 缺失任一返回 null，账号按未配置回调处理。
     */
    public static CallbackKey callbackOf(CompanyChannelDO account) {
        Map<String, Object> info = info(account);
        String corpId = text(info, INFO_CORP_ID);
        String token = text(info, INFO_TOKEN);
        String encodingAesKey = text(info, INFO_ENCODING_AES_KEY);
        return corpId == null || token == null || encodingAesKey == null
            ? null
            : new CallbackKey(corpId, token, encodingAesKey);
    }

    private static Map<String, Object> info(CompanyChannelDO account) {
        return account == null ? null : account.getChannelInfo();
    }

    private static String text(Map<String, Object> info, String key) {
        Object value = info == null ? null : info.get(key);
        return value instanceof String text && !text.isBlank() ? text : null;
    }
}
