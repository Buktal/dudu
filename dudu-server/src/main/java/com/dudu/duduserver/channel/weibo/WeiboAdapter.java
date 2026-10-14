package com.dudu.duduserver.channel.weibo;

import com.dudu.duduserver.channel.ChannelAdapter;
import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.channel.ChannelReceiveResult;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;

/**
 * 微博适配器：组合三参验签协议、客服消息纯文本主动回复与粉服素材读取，聚合该渠道的
 * 服务器验证、入站接收与发送/读取能力说明（事实见 docs/research/channels/weibo.md）。
 * 验签密钥是 App Secret 而非自定义 Token，握手与每次推送同样三参验签；推送为 JSON 明文，
 * 微博要求 5 秒内应答且回空串即不重试（事实库 §3.3），故消息与事件都应答 200 空串，回复
 * 走客服消息接口异步下发。发送与素材共用 channel_info 直配的 accessToken。
 */
@Component
public class WeiboAdapter implements ChannelAdapter {

    // 验签密钥（APPKEY 对应的 App Secret）与接口凭据（粉服 access_token）都住在 channel_info
    private static final String INFO_APP_SECRET = "appSecret";

    // 凭据缺失的如实说明：不编造可发可读能力
    private static final String SEND_CREDENTIALS_MISSING = "渠道发送凭据未配置";
    private static final String MEDIA_CREDENTIALS_MISSING = "渠道素材凭据未配置";

    // 微博应答语义：200 空串表示已收到且不重试（无 "success" 口径）
    private static final ChannelCallbackResult ACK = new ChannelCallbackResult(200, "");

    private final WeiboProtocol protocol;

    private final WeiboTextSender textSender;

    private final WeiboMediaReader mediaReader;

    public WeiboAdapter(WeiboProtocol protocol, WeiboTextSender textSender, WeiboMediaReader mediaReader) {
        this.protocol = protocol;
        this.textSender = textSender;
        this.mediaReader = mediaReader;
    }

    @Override
    public ChannelEnum channel() {
        return ChannelEnum.WEIBO;
    }

    @Override
    public ChannelCallbackResult verifyUrl(CompanyChannelDO account, Map<String, String> query, HttpHeaders headers) {
        String appSecret = appSecret(account);
        if (appSecret == null) {
            return ChannelCallbackResult.unsupported();
        }
        if (!protocol.verify(appSecret, query.get("signature"), query.get("timestamp"), query.get("nonce"))) {
            return ChannelCallbackResult.rejected();
        }
        String echostr = query.get("echostr");
        if (echostr == null || echostr.isEmpty()) {
            return ChannelCallbackResult.badRequest();
        }
        return ChannelCallbackResult.echo(echostr);
    }

    @Override
    public ChannelReceiveResult receive(CompanyChannelDO account, Map<String, String> query, HttpHeaders headers,
                                        String body) {
        String appSecret = appSecret(account);
        if (appSecret == null) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.unsupported());
        }
        if (!protocol.verify(appSecret, query.get("signature"), query.get("timestamp"), query.get("nonce"))) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.rejected());
        }
        Optional<ChannelInboundMessage> inbound;
        try {
            inbound = protocol.parse(account.getCompanyChannelId(), body);
        } catch (IllegalArgumentException e) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
        // 事件推送与被@不是访客消息：同样回空串应答，不产生访客与消息数据
        return inbound.map(message -> ChannelReceiveResult.accept(message, ACK))
            .orElseGet(() -> ChannelReceiveResult.answer(ACK));
    }

    @Override
    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        return textSender.send(account, externalUserId, text);
    }

    @Override
    public ChannelMediaResult readMedia(CompanyChannelDO account, String externalMediaId) {
        return mediaReader.read(account, externalMediaId);
    }

    @Override
    public String sendRestriction(CompanyChannelDO account) {
        return WeiboCredentials.of(account) == null ? SEND_CREDENTIALS_MISSING : null;
    }

    @Override
    public String mediaRestriction(CompanyChannelDO account) {
        return WeiboCredentials.of(account) == null ? MEDIA_CREDENTIALS_MISSING : null;
    }

    // 只配置了 accessToken 的账号可发送与读取素材，但没有验签与回调接收的能力
    private String appSecret(CompanyChannelDO account) {
        Map<String, Object> info = account == null ? null : account.getChannelInfo();
        Object value = info == null ? null : info.get(INFO_APP_SECRET);
        return value instanceof String appSecret && !appSecret.isEmpty() ? appSecret : null;
    }
}
