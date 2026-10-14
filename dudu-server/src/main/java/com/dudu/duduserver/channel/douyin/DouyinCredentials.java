package com.dudu.duduserver.channel.douyin;

import com.dudu.duduserver.channel.support.ChannelInfoText;
import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Map;

/**
 * 抖音渠道凭据（事实见 docs/research/channels/douyin.md §6、§6.1）：从
 * company_channel.channel_info 读取 clientKey 与 clientSecret（dop 应用标识与
 * webhook 验签 key，键名照抄 mock-pulse config.rs serde camelCase）与可选
 * refreshToken（发送侧用户授权刷新凭证——access_token 需用户授权 code 换取，
 * 仅凭 clientKey/clientSecret 无法获得，运营完成授权后录入，30 天有效期）；
 * 任一必填键缺失返回 null，凭据不写入日志也不返回给 Desk。
 */
public record DouyinCredentials(String clientKey, String clientSecret, String refreshToken) {

    private static final String INFO_CLIENT_KEY = "clientKey";
    private static final String INFO_CLIENT_SECRET = "clientSecret";
    private static final String INFO_REFRESH_TOKEN = "refreshToken";

    public static DouyinCredentials of(CompanyChannelDO account) {
        Map<String, Object> info = account == null ? null : account.getChannelInfo();
        String clientKey = ChannelInfoText.text(info, INFO_CLIENT_KEY);
        String clientSecret = ChannelInfoText.text(info, INFO_CLIENT_SECRET);
        if (clientKey == null || clientSecret == null) {
            return null;
        }
        // refreshToken 可选：未完成用户授权的账号回调收发不受影响（§6.1）
        return new DouyinCredentials(clientKey, clientSecret, ChannelInfoText.text(info, INFO_REFRESH_TOKEN));
    }
}
