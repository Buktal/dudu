package com.dudu.duduserver.channel.wechatmini;

import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.channel.support.WechatMediaReader;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * 微信小程序素材读取（获取临时素材）装配薄层：与公众号同 URL 同协议
 * （docs/research/channels/wechat-mini.md §6.4），协议逻辑（换取凭据、素材读取、
 * video_url 二次直取与 downloadClient 先于 baseUrl 构建的超时纪律）住在微信族共享骨架
 * WechatMediaReader；本类只绑定小程序的 api-base 覆盖键、日志标签与凭据读取，独立实例化
 * 骨架以维持「发送与素材各建各的客户端」的令牌缓存隔离。接口地址默认官方域名，可用
 * dudu.channel.wechat-mini.api-base 覆盖为受控替身。
 */
@Component
public class WechatMiniMediaReader {

    private static final String DEFAULT_API_BASE = "https://api.weixin.qq.com";

    private final WechatMediaReader<WechatMiniCredentials> delegate;

    public WechatMiniMediaReader(RestClient.Builder builder,
                                 @Value("${dudu.channel.wechat-mini.api-base:" + DEFAULT_API_BASE + "}") String apiBase) {
        this.delegate = new WechatMediaReader<>(builder, apiBase, "wechat-mini",
            WechatMiniCredentials::appId, WechatMiniCredentials::appSecret);
    }

    public ChannelMediaResult read(CompanyChannelDO account, String externalMediaId) {
        return delegate.read(WechatMiniCredentials.of(account), account.getCompanyChannelId(), externalMediaId);
    }
}
