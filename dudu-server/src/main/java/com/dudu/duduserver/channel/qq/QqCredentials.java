package com.dudu.duduserver.channel.qq;

import com.dudu.duduserver.channel.support.ChannelInfoText;
import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Map;

/**
 * QQ 机器人渠道凭据，从 company_channel.channel_info 收窄读取（键对照 mock-pulse
 * config.rs ConnectionConfig::Qq 的 serde 键，camelCase）：接口凭据 appId/appSecret 用于
 * 换取 access_token（官方 access-token 页，body 字段即 appId/clientSecret）；回调材料
 * 仅需 appSecret——它是 Ed25519 签名密钥的派生种子（官方 sign 页「Bot Secret」），与
 * 接口凭据解耦，只配 appSecret 的账号仍可验签收推送。缺失必需字段返回 null，由调用方
 * 按「该账号未配置」处理；凭据不写入日志也不返回给 Desk。
 */
public record QqCredentials(String appId, String appSecret) {

    private static final String INFO_APP_ID = "appId";
    private static final String INFO_APP_SECRET = "appSecret";

    /**
     * 接口凭据：换取 access_token 需 appId/appSecret（官方 access-token 页）；缺失任一
     * 返回 null，账号按未配置发送处理。
     */
    public static QqCredentials of(CompanyChannelDO account) {
        Map<String, Object> info = info(account);
        String appId = ChannelInfoText.text(info, INFO_APP_ID);
        String appSecret = ChannelInfoText.text(info, INFO_APP_SECRET);
        return appId == null || appSecret == null ? null : new QqCredentials(appId, appSecret);
    }

    /**
     * 回调材料：验签只需要 appSecret（Ed25519 密钥派生种子，官方 §4）；缺失返回 null，
     * 账号按未配置回调处理。
     */
    public static String callbackSecretOf(CompanyChannelDO account) {
        return ChannelInfoText.text(info(account), INFO_APP_SECRET);
    }

    private static Map<String, Object> info(CompanyChannelDO account) {
        return account == null ? null : account.getChannelInfo();
    }
}
