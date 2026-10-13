package com.dudu.duduserver.channel.wechatmp;

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
 * 微信公众号适配器：组合明文模式回调协议、客服消息纯文本发送与素材读取，聚合该渠道的
 * 服务器验证、入站接收与发送/读取能力说明；回调验签 Token（channel_info.token）与
 * 兼容/安全模式判定住在包内——加密模式需要 EncodingAESKey 解密，未接入按不支持处理。
 * 事实见 docs/research/channels/wechat-mp.md。
 */
@Component
public class WechatMpAdapter implements ChannelAdapter {

    // 公众号服务器配置的 Token，用于三参签名比对
    private static final String INFO_TOKEN = "token";

    // 兼容/安全模式的标识参数；需要 EncodingAESKey 解密，本票未接入
    private static final String PARAM_ENCRYPT_TYPE = "encrypt_type";

    // 凭据缺失的如实说明：不编造可发可读能力
    private static final String SEND_CREDENTIALS_MISSING = "渠道发送凭据未配置";
    private static final String MEDIA_CREDENTIALS_MISSING = "渠道素材凭据未配置";

    private final WechatMpProtocol protocol;

    private final WechatMpTextSender textSender;

    private final WechatMpMediaReader mediaReader;

    public WechatMpAdapter(WechatMpProtocol protocol, WechatMpTextSender textSender, WechatMpMediaReader mediaReader) {
        this.protocol = protocol;
        this.textSender = textSender;
        this.mediaReader = mediaReader;
    }

    @Override
    public ChannelEnum channel() {
        return ChannelEnum.WECHAT_MP;
    }

    @Override
    public ChannelCallbackResult verifyUrl(CompanyChannelDO account, Map<String, String> query, HttpHeaders headers) {
        String token = callbackToken(account);
        if (token == null) {
            return ChannelCallbackResult.unsupported();
        }
        if (!protocol.verify(token, query.get("signature"), query.get("timestamp"), query.get("nonce"))) {
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
        String token = callbackToken(account);
        if (token == null || query.containsKey(PARAM_ENCRYPT_TYPE)) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.unsupported());
        }
        if (!protocol.verify(token, query.get("signature"), query.get("timestamp"), query.get("nonce"))) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.rejected());
        }
        Optional<ChannelInboundMessage> inbound;
        try {
            inbound = protocol.parse(account.getCompanyChannelId(), body);
        } catch (IllegalArgumentException e) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
        // 事件推送不是访客消息：只按渠道要求应答，不产生访客与消息数据
        return inbound.map(ChannelReceiveResult::accept)
            .orElseGet(() -> ChannelReceiveResult.answer(ChannelCallbackResult.success()));
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
        return WechatMpCredentials.of(account) == null ? SEND_CREDENTIALS_MISSING : null;
    }

    @Override
    public String mediaRestriction(CompanyChannelDO account) {
        return WechatMpCredentials.of(account) == null ? MEDIA_CREDENTIALS_MISSING : null;
    }

    // 只配置了回调 Token 的账号可完成握手与推送验签，但没有换取接口凭据的能力
    private String callbackToken(CompanyChannelDO account) {
        Map<String, Object> info = account.getChannelInfo();
        Object token = info == null ? null : info.get(INFO_TOKEN);
        return token instanceof String value && !value.isEmpty() ? value : null;
    }
}
