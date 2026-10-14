package com.dudu.duduserver.channel.wechatmini;

import com.dudu.duduserver.channel.support.ChannelInfoText;
import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Map;

/**
 * 小程序接口凭据：从 company_channel.channel_info 读取 appId 与 appSecret，用于换取
 * access_token（发送与素材读取共用，事实见 docs/research/channels/wechat-mini.md §6.1；
 * mock 连接配置不含 appSecret——它不模拟 token 换取，服务端按公众号先例补入）；
 * 缺失任一返回 null，凭据不写入日志也不返回给 Desk。
 */
public record WechatMiniCredentials(String appId, String appSecret) {

    private static final String INFO_APP_ID = "appId";
    private static final String INFO_APP_SECRET = "appSecret";

    public static WechatMiniCredentials of(CompanyChannelDO account) {
        Map<String, Object> info = account == null ? null : account.getChannelInfo();
        String appId = ChannelInfoText.text(info, INFO_APP_ID);
        String appSecret = ChannelInfoText.text(info, INFO_APP_SECRET);
        return appId == null || appSecret == null ? null : new WechatMiniCredentials(appId, appSecret);
    }
}
