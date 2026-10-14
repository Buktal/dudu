package com.dudu.duduserver.channel.wechatmp;

import com.dudu.duduserver.channel.support.ChannelInfoText;
import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Map;

/**
 * 公众号接口凭据：从 company_channel.channel_info 读取 appId 与 appSecret，用于换取
 * access_token（发送与素材读取共用，事实见 docs/research/channels/wechat-mp.md §6）；
 * 缺失任一返回 null，凭据不写入日志也不返回给 Desk。
 */
public record WechatMpCredentials(String appId, String appSecret) {

    private static final String INFO_APP_ID = "appId";
    private static final String INFO_APP_SECRET = "appSecret";

    public static WechatMpCredentials of(CompanyChannelDO account) {
        Map<String, Object> info = account == null ? null : account.getChannelInfo();
        String appId = ChannelInfoText.text(info, INFO_APP_ID);
        String appSecret = ChannelInfoText.text(info, INFO_APP_SECRET);
        return appId == null || appSecret == null ? null : new WechatMpCredentials(appId, appSecret);
    }
}
