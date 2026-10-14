package com.dudu.duduserver.channel.weibo;

import com.dudu.duduserver.channel.support.ChannelInfoText;
import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Map;

/**
 * 微博接口凭据：粉服 access_token 绑定认证账号而非 APPKEY（事实见
 * docs/research/channels/weibo.md §6、§6.1——OAuth2 途径官方至今标注暂未上线，现行唯一
 * 途径是粉服后台开发者模式页直取，故 channel_info 直配 accessToken）；发送与素材读取
 * 共用，凭据不写入日志也不返回给 Desk。
 */
public record WeiboCredentials(String accessToken) {

    private static final String INFO_ACCESS_TOKEN = "accessToken";

    public static WeiboCredentials of(CompanyChannelDO account) {
        Map<String, Object> info = account == null ? null : account.getChannelInfo();
        String accessToken = ChannelInfoText.text(info, INFO_ACCESS_TOKEN);
        return accessToken == null ? null : new WeiboCredentials(accessToken);
    }
}
