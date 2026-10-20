package com.dudu.duduserver.channel.wechatmp;

import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.channel.support.WechatMediaReader;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * 微信公众号素材读取装配薄层，与小程序复用协议实现
 * （docs/research/channels/wechat-mp.md §2.1、§6），协议逻辑（换取凭据、素材读取、
 * video_url 二次直取与 downloadClient 先于 baseUrl 构建的超时纪律）住在微信族共享骨架
 * WechatMediaReader；本类只绑定公众号的 api-base 覆盖键、日志标签与凭据读取，独立实例化
 * 骨架以维持「发送与素材各建各的客户端」的令牌缓存隔离。接口地址默认官方域名，可用
 * dudu.channel.wechat-mp.api-base 覆盖为受控替身。
 */
@Component
public class WechatMpMediaReader {

    private static final String DEFAULT_API_BASE = "https://api.weixin.qq.com";

    private final WechatMediaReader<WechatMpCredentials> delegate;

    public WechatMpMediaReader(RestClient.Builder builder,
                                 @Value("${dudu.channel.wechat-mp.api-base:" + DEFAULT_API_BASE + "}") String apiBase) {
        this.delegate = new WechatMediaReader<>(builder, apiBase, "wechat-mp",
            WechatMpCredentials::appId, WechatMpCredentials::appSecret);
    }

    public ChannelMediaResult read(CompanyChannelDO account, String externalMediaId) {
        return delegate.read(WechatMpCredentials.of(account), account.getCompanyChannelId(), externalMediaId);
    }
}
