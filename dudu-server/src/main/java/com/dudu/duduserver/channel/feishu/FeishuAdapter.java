package com.dudu.duduserver.channel.feishu;

import com.dudu.duduserver.channel.ChannelAdapter;
import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.channel.ChannelReceiveResult;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.channel.support.ChannelRestrictions;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import cn.hutool.json.JSONUtil;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;

/**
 * 飞书适配器：组合回调协议、纯文本发送与消息资源读取，聚合该渠道的接收、发送与
 * 读取能力说明。飞书只有 POST url_verification 握手（官方 §3.2），走 POST 回调入口：
 * 明文三参或加密信封验签后回显 challenge；事件推送按 v2.0 信封验签解密后解析。
 * challenge 应答体是 JSON 而非 success 字面，按官方应答形态直构；
 * 凭据住在包内（回调 appId/verificationToken/encryptKey 与发送 appId/appSecret 两分组，
 * {@link FeishuCredentials} 与 {@link FeishuSendCredentials}），缺失按不支持或限制说明
 * 如实回答。事实见 docs/research/channels/feishu.md。
 */
@Component
public class FeishuAdapter implements ChannelAdapter {

    // 官方 §4.2 的三个签名头（加密模式必须；明文模式无签名头）
    private static final String HEADER_TIMESTAMP = "X-Lark-Request-Timestamp";
    private static final String HEADER_NONCE = "X-Lark-Request-Nonce";
    private static final String HEADER_SIGNATURE = "X-Lark-Signature";

    private final FeishuProtocol protocol;

    private final FeishuTextSender textSender;

    private final FeishuMediaReader mediaReader;

    public FeishuAdapter(FeishuProtocol protocol, FeishuTextSender textSender, FeishuMediaReader mediaReader) {
        this.protocol = protocol;
        this.textSender = textSender;
        this.mediaReader = mediaReader;
    }

    @Override
    public ChannelEnum channel() {
        return ChannelEnum.FEISHU;
    }

    @Override
    public ChannelReceiveResult receive(CompanyChannelDO account, Map<String, String> query, HttpHeaders headers,
                                        String body) {
        FeishuCredentials credentials = FeishuCredentials.of(account);
        if (credentials == null) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.unsupported());
        }
        if (!protocol.verify(credentials, headers.getFirst(HEADER_TIMESTAMP), headers.getFirst(HEADER_NONCE),
            headers.getFirst(HEADER_SIGNATURE), body)) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.rejected());
        }
        String plaintext;
        try {
            plaintext = protocol.plaintext(credentials, body);
        } catch (IllegalArgumentException e) {
            // 签名已过但信封无法解密：密钥不符，按验签拒绝处理
            return ChannelReceiveResult.answer(ChannelCallbackResult.rejected());
        }
        String challenge = protocol.challengeOf(plaintext);
        if (challenge != null) {
            // 官方 §3.2：期望 1s 内原样回显 {"challenge":"<同值>"}
            return ChannelReceiveResult.answer(new ChannelCallbackResult(200,
                JSONUtil.createObj().set("challenge", challenge).toString()));
        }
        Optional<ChannelInboundMessage> inbound;
        try {
            inbound = protocol.parse(account.getCompanyChannelId(), plaintext);
        } catch (IllegalArgumentException e) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
        // 已读、撤回等其余事件只按渠道要求应答，不产生访客与消息数据
        return acceptOrAnswer(inbound);
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
        return FeishuSendCredentials.of(account) == null ? ChannelRestrictions.SEND_CREDENTIALS_MISSING : null;
    }

    @Override
    public String mediaRestriction(CompanyChannelDO account) {
        return FeishuSendCredentials.of(account) == null ? ChannelRestrictions.MEDIA_CREDENTIALS_MISSING : null;
    }
}
