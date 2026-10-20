package com.dudu.duduserver.channel.wechatmini;

import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.channel.support.WechatTextSender;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * 微信客服文本发送装配，协议与令牌缓存由共享实现维护。
 */
@Component
public class WechatMiniTextSender {
    private static final String DEFAULT_API_BASE = "https://api.weixin.qq.com";
    private final WechatTextSender<WechatMiniCredentials> delegate;

    public WechatMiniTextSender(RestClient.Builder builder,
        @Value("${dudu.channel.wechat-mini.api-base:" + DEFAULT_API_BASE + "}") String apiBase) {
        this.delegate = new WechatTextSender<>(builder, apiBase, "wechat-mini",
            WechatMiniCredentials::appId, WechatMiniCredentials::appSecret);
    }

    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        return delegate.send(WechatMiniCredentials.of(account), account.getCompanyChannelId(), externalUserId, text);
    }
}
