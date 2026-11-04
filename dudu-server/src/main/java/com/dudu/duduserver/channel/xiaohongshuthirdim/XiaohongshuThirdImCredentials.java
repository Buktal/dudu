package com.dudu.duduserver.channel.xiaohongshuthirdim;

import com.dudu.duduserver.channel.support.ChannelInfoText;
import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Map;

/**
 * 小红书私信三方绑定凭据（事实见 docs/research/channels/xiaohongshu.md §13.4、§13.9）：
 * channel_info 携带应用身份 appId/secret（官方报文形态为 long 型 app_id 与字符串
 * secret）与 OAuth 双 token——access_token 一天、refresh_token 30 天且每次刷新轮换
 * 重置有效期。授权由运营走 ad-market 授权 URL 完成（scope 含 third_im，回调 auth_code
 * 十分钟时效），本控制台不发起 OAuth，首对令牌由运营换取后录入 refreshToken，与抖音
 * refreshToken 的录入模式同构。appId 或 secret 缺失即绑定骨架未完成，返回 null。
 * pushToken 是线索推送验签密钥（聚光后台「私信 API 对接」工具获取，与 OAuth secret
 * 不同物，官方验签可选）：缺失时跳过验签仍可接收（xiaohongshu-third-im-spec.md §1.2）。
 * 凭据不写入日志也不返回给 Desk。
 */
public record XiaohongshuThirdImCredentials(String appId, String secret, String accessToken, String refreshToken,
                                            String pushToken) {

    private static final String INFO_APP_ID = "appId";
    private static final String INFO_SECRET = "secret";
    private static final String INFO_ACCESS_TOKEN = "accessToken";
    private static final String INFO_REFRESH_TOKEN = "refreshToken";
    private static final String INFO_PUSH_TOKEN = "pushToken";

    public static XiaohongshuThirdImCredentials of(CompanyChannelDO account) {
        Map<String, Object> info = account == null ? null : account.getChannelInfo();
        String appId = ChannelInfoText.text(info, INFO_APP_ID);
        String secret = ChannelInfoText.text(info, INFO_SECRET);
        if (appId == null || secret == null) {
            return null;
        }
        // 双 token 与推送验签密钥可选：refreshToken 缺失即令牌链路未授权，pushToken
        // 缺失即验签跳过，绑定骨架与线索接收均仍可先行
        return new XiaohongshuThirdImCredentials(appId, secret,
            ChannelInfoText.text(info, INFO_ACCESS_TOKEN), ChannelInfoText.text(info, INFO_REFRESH_TOKEN),
            ChannelInfoText.text(info, INFO_PUSH_TOKEN));
    }
}
