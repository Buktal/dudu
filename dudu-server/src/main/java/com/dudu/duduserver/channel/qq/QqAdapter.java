package com.dudu.duduserver.channel.qq;

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
 * QQ 机器人适配器：Ed25519 签名回调（op13 首次验证握手 + op0 Dispatch 验签解析，无 GET
 * 验证阶段故沿用接口默认不支持）、纯文本发送（单聊/群 v2 接口，频道会话未接入——官方要求
 * WS 在线）与入站媒体读取（附件 url 直读）。签名材料只有 appSecret，接口凭据 appId/
 * appSecret 只约束发送。事实见 docs/research/channels/qq.md。
 */
@Component
public class QqAdapter implements ChannelAdapter {

    // 未配置相应凭据时的如实说明：不编造可发可读能力
    private static final String SEND_CREDENTIALS_MISSING = "渠道发送凭据未配置";

    // 通用信封 opcode（官方 §5.1/payload 页）
    private static final int OP_DISPATCH = 0;
    private static final int OP_VALIDATION = 13;

    // 签名与握手材料所在的 HTTP 头（webhook 页 §1/§3.2，HttpHeaders 大小写不敏感）
    private static final String HEADER_SIGNATURE = "X-Signature-Ed25519";
    private static final String HEADER_TIMESTAMP = "X-Signature-Timestamp";

    // 握手事件体字段（官方 §3.2）
    private static final String KEY_PLAIN_TOKEN = "plain_token";
    private static final String KEY_EVENT_TS = "event_ts";

    private final QqProtocol protocol;

    private final QqTextSender textSender;

    private final QqMediaReader mediaReader;

    public QqAdapter(QqProtocol protocol, QqTextSender textSender, QqMediaReader mediaReader) {
        this.protocol = protocol;
        this.textSender = textSender;
        this.mediaReader = mediaReader;
    }

    @Override
    public ChannelEnum channel() {
        return ChannelEnum.QQ;
    }

    @Override
    public ChannelReceiveResult receive(CompanyChannelDO account, Map<String, String> query, HttpHeaders headers,
                                        String body) {
        String appSecret = QqCredentials.callbackSecretOf(account);
        if (appSecret == null) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.unsupported());
        }
        QqProtocol.Envelope envelope;
        try {
            envelope = protocol.envelope(body);
        } catch (IllegalArgumentException e) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
        if (envelope.op() == OP_VALIDATION) {
            return handshake(appSecret, envelope);
        }
        if (envelope.op() != OP_DISPATCH) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
        if (!protocol.verify(appSecret, headers == null ? null : headers.getFirst(HEADER_SIGNATURE),
            headers == null ? null : headers.getFirst(HEADER_TIMESTAMP), body)) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.rejected());
        }
        Optional<ChannelInboundMessage> inbound;
        try {
            inbound = protocol.parse(account.getCompanyChannelId(), envelope);
        } catch (IllegalArgumentException e) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
        // 消息事件落库后应答；事件推送/未收录事件只应答（回包体官方无口径，qq.md §7.1）
        return inbound.map(ChannelReceiveResult::accept)
            .orElseGet(() -> ChannelReceiveResult.answer(ChannelCallbackResult.success()));
    }

    // op13 首次验证握手（官方 §3.2）：回 plain_token 回显 + event_ts+plain_token 的签名
    private ChannelReceiveResult handshake(String appSecret, QqProtocol.Envelope envelope) {
        String plainToken = envelope.d().getStr(KEY_PLAIN_TOKEN);
        String eventTs = envelope.d().getStr(KEY_EVENT_TS);
        if (plainToken == null || plainToken.isEmpty() || eventTs == null || eventTs.isEmpty()) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
        return ChannelReceiveResult.answer(
            new ChannelCallbackResult(200, protocol.handshakeResponse(appSecret, plainToken, eventTs)));
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
        return QqCredentials.of(account) == null ? SEND_CREDENTIALS_MISSING : null;
    }

    @Override
    public String mediaRestriction(CompanyChannelDO account) {
        // 入站附件是带签名的公开下载链接，无需渠道凭据即可读取
        return null;
    }
}
