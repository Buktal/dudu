package com.dudu.duduserver.channel.whatsapp;

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
 * WhatsApp Cloud API 适配器：GET 三参握手（hub.mode=subscribe + verifyToken 比对后裸回
 * hub.challenge，回 JSON 会失败）、POST X-Hub-Signature-256 验签解析（对原始字节算
 * HMAC-SHA256 常量时间比对，statuses 与管理面变更只应答）、纯文本发送与媒体下载两步
 * 读取共用发送侧凭据。回调材料（verifyToken/appSecret）与接口凭据（accessToken/
 * phoneNumberId）是两套无关值，只配回调三键的账号可收推送但发送与读素材受限。
 * 事实见 docs/research/channels/whatsapp.md。
 */
@Component
public class WhatsappAdapter implements ChannelAdapter {

    // GET 握手三参（官方 §3.2）
    private static final String PARAM_MODE = "hub.mode";
    private static final String PARAM_CHALLENGE = "hub.challenge";
    private static final String PARAM_VERIFY_TOKEN = "hub.verify_token";
    private static final String MODE_SUBSCRIBE = "subscribe";

    // POST 签名头（官方 §4.2；旧头 X-Hub-Signature 为 SHA-1 忽略，HttpHeaders 大小写不敏感）
    private static final String HEADER_SIGNATURE = "X-Hub-Signature-256";

    // 未配置相应凭据时的如实说明：不编造可发可读能力
    private static final String SEND_CREDENTIALS_MISSING = "渠道发送凭据未配置";
    private static final String MEDIA_CREDENTIALS_MISSING = "渠道素材凭据未配置";

    private final WhatsappProtocol protocol;

    private final WhatsappTextSender textSender;

    private final WhatsappMediaReader mediaReader;

    public WhatsappAdapter(WhatsappProtocol protocol, WhatsappTextSender textSender,
                           WhatsappMediaReader mediaReader) {
        this.protocol = protocol;
        this.textSender = textSender;
        this.mediaReader = mediaReader;
    }

    @Override
    public ChannelEnum channel() {
        return ChannelEnum.WHATSAPP;
    }

    @Override
    public ChannelCallbackResult verifyUrl(CompanyChannelDO account, Map<String, String> query, HttpHeaders headers) {
        WhatsappCredentials credentials = WhatsappCredentials.of(account);
        if (credentials == null) {
            return ChannelCallbackResult.unsupported();
        }
        // hub.mode 恒为 subscribe，verify_token 与存量比对，任一不符回非 200（官方示例 403）
        if (!MODE_SUBSCRIBE.equals(query.get(PARAM_MODE))
            || !credentials.verifyToken().equals(query.get(PARAM_VERIFY_TOKEN))) {
            return ChannelCallbackResult.rejected();
        }
        String challenge = query.get(PARAM_CHALLENGE);
        if (challenge == null || challenge.isEmpty()) {
            return ChannelCallbackResult.badRequest();
        }
        // hub.challenge 裸值纯文本回显（官方 echo-bot 示例 res.status(200).send(challenge)）
        return ChannelCallbackResult.echo(challenge);
    }

    @Override
    public ChannelReceiveResult receive(CompanyChannelDO account, Map<String, String> query, HttpHeaders headers,
                                        String body) {
        WhatsappCredentials credentials = WhatsappCredentials.of(account);
        if (credentials == null) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.unsupported());
        }
        if (!protocol.verify(credentials.appSecret(),
            headers == null ? null : headers.getFirst(HEADER_SIGNATURE), body)) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.rejected());
        }
        Optional<ChannelInboundMessage> inbound;
        try {
            inbound = protocol.parse(account.getCompanyChannelId(), body);
        } catch (IllegalArgumentException e) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
        // 来语落库后应答；statuses 与管理面字段变更只按 200 应答不落库（§3.3）
        return inbound.map(ChannelReceiveResult::accept)
            .orElseGet(() -> ChannelReceiveResult.answer(ChannelCallbackResult.success()));
    }

    @Override
    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        if (WhatsappSendCredentials.of(account) == null) {
            return ChannelSendResult.failed(SEND_CREDENTIALS_MISSING);
        }
        return textSender.send(account, externalUserId, text);
    }

    @Override
    public ChannelMediaResult readMedia(CompanyChannelDO account, String externalMediaId) {
        if (WhatsappSendCredentials.of(account) == null) {
            return ChannelMediaResult.failed(MEDIA_CREDENTIALS_MISSING);
        }
        return mediaReader.read(account, externalMediaId);
    }

    @Override
    public String sendRestriction(CompanyChannelDO account) {
        return WhatsappSendCredentials.of(account) == null ? SEND_CREDENTIALS_MISSING : null;
    }

    @Override
    public String mediaRestriction(CompanyChannelDO account) {
        // 媒体下载两步都要 Bearer accessToken（§5.6），与发送共用同一份接口凭据
        return WhatsappSendCredentials.of(account) == null ? MEDIA_CREDENTIALS_MISSING : null;
    }
}
