package com.dudu.duduserver.channel.wecom;

import com.dudu.duduserver.channel.ChannelAdapter;
import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.channel.ChannelReceiveResult;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.channel.support.ChannelRestrictions;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;

/**
 * 企业微信适配器：组合加密回调协议（echostr 握手 + 密文信封推送）、应用消息纯文本发送
 * 与临时素材读取，聚合该渠道的服务器验证、入站接收与发送/读取能力说明。验签材料全在
 * URL query（msg_signature/timestamp/nonce），密文在 body 信封的 Encrypt 字段或 echostr
 * 参数；解密尾部 receiveid 须与 corpId 校验。推送通道只接入自建应用 agent（system 缺省
 * 值），aibot JSON 通道未接入按不支持处理。事实见 docs/research/channels/wecom.md。
 */
@Component
public class WecomAdapter implements ChannelAdapter {

    // 推送通道标识（channel_info.system，serde 键对照 mock-pulse config.rs，缺省 agent）
    private static final String INFO_SYSTEM = "system";
    private static final String SYSTEM_AGENT = "agent";
    private static final String SYSTEM_AIBOT = "aibot";

    // 凭据缺失与通道未接入的如实说明：不编造可发可读能力
    private static final String SEND_AIBOT_NOT_CONNECTED = "企业微信智能机器人通道暂未接入发送";
    private static final String MEDIA_AIBOT_NOT_CONNECTED = "企业微信智能机器人通道暂未接入素材读取";

    private final WecomProtocol protocol;

    private final WecomTextSender textSender;

    private final WecomMediaReader mediaReader;

    public WecomAdapter(WecomProtocol protocol, WecomTextSender textSender, WecomMediaReader mediaReader) {
        this.protocol = protocol;
        this.textSender = textSender;
        this.mediaReader = mediaReader;
    }

    @Override
    public ChannelEnum channel() {
        return ChannelEnum.WECOM;
    }

    @Override
    public ChannelCallbackResult verifyUrl(CompanyChannelDO account, Map<String, String> query, HttpHeaders headers) {
        WecomCredentials.CallbackKey callback = callbackMaterial(account);
        if (callback == null) {
            return ChannelCallbackResult.unsupported();
        }
        String echostr = query.get("echostr");
        if (echostr == null || echostr.isEmpty()) {
            return ChannelCallbackResult.badRequest();
        }
        if (!protocol.verify(callback.token(), query.get("msg_signature"), query.get("timestamp"),
            query.get("nonce"), echostr)) {
            return ChannelCallbackResult.rejected();
        }
        WecomProtocol.Decrypted decrypted;
        try {
            decrypted = protocol.decrypt(callback.encodingAesKey(), echostr);
        } catch (IllegalArgumentException e) {
            return ChannelCallbackResult.badRequest();
        }
        // 解密尾部 receiveid 须为本企业 corpId（官方 §4.4）
        if (!callback.corpId().equals(decrypted.receiveid())) {
            return ChannelCallbackResult.rejected();
        }
        // 官方 §3.2：响应体为解密所得明文本身，不加引号、不带 BOM、不带换行
        return ChannelCallbackResult.echo(decrypted.xml());
    }

    @Override
    public ChannelReceiveResult receive(CompanyChannelDO account, Map<String, String> query, HttpHeaders headers,
                                        String body) {
        WecomCredentials.CallbackKey callback = callbackMaterial(account);
        if (callback == null) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.unsupported());
        }
        String msgEncrypt;
        try {
            msgEncrypt = protocol.envelopeEncrypt(body);
        } catch (IllegalArgumentException e) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
        if (!protocol.verify(callback.token(), query.get("msg_signature"), query.get("timestamp"),
            query.get("nonce"), msgEncrypt)) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.rejected());
        }
        WecomProtocol.Decrypted decrypted;
        try {
            decrypted = protocol.decrypt(callback.encodingAesKey(), msgEncrypt);
        } catch (IllegalArgumentException e) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
        if (!callback.corpId().equals(decrypted.receiveid())) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.rejected());
        }
        Optional<ChannelInboundMessage> inbound;
        try {
            inbound = protocol.parse(account.getCompanyChannelId(), decrypted.xml());
        } catch (IllegalArgumentException e) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
        // 事件推送不是访客消息：按官方三态之一应答 success，不产生访客与消息数据
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
        if (isAibot(account)) {
            return SEND_AIBOT_NOT_CONNECTED;
        }
        return WecomCredentials.of(account) == null ? ChannelRestrictions.SEND_CREDENTIALS_MISSING : null;
    }

    @Override
    public String mediaRestriction(CompanyChannelDO account) {
        if (isAibot(account)) {
            return MEDIA_AIBOT_NOT_CONNECTED;
        }
        return WecomCredentials.of(account) == null ? ChannelRestrictions.MEDIA_CREDENTIALS_MISSING : null;
    }

    // 回调材料缺失（或账号为空）按未配置回调处理，握手与推送一律不支持
    private WecomCredentials.CallbackKey callbackMaterial(CompanyChannelDO account) {
        return isAibot(account) ? null : WecomCredentials.callbackOf(account);
    }

    // system 缺省 agent；aibot JSON 通道本票未接入
    private boolean isAibot(CompanyChannelDO account) {
        Object system = account == null || account.getChannelInfo() == null
            ? null
            : account.getChannelInfo().get(INFO_SYSTEM);
        return SYSTEM_AIBOT.equals(system);
    }
}
