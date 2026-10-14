package com.dudu.duduserver.channel.xiaohongshu;

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
 * 小红书适配器：组合回调验签加解密协议、客服消息纯文本主动回复与素材链接下载，聚合该
 * 渠道的服务器验证、入站接收与发送/读取能力说明（事实见
 * docs/research/channels/xiaohongshu.md）。回调配置四要素住在 channel_info：token
 * （三参验签）、encodingAesKey 与 appId（加解密与尾部来源校验）；握手为 GET query 四参数
 * （signature/timestamp/nonce/echostr，§10.4）；推送全部为加密 JSON 信封（§11.2 签名材料
 * 在 body），验签须用四参 MsgSignature 并经 AES 解密，明文尾部 appId 须与本账号一致
 * （§11.4 receiveid=appId）。发送凭据 appId/appSecret 另见
 * {@link XiaohongshuSendCredentials}，两套互不混用。
 */
@Component
public class XiaohongshuAdapter implements ChannelAdapter {

    private final XiaohongshuProtocol protocol;

    private final XiaohongshuCrypto crypto;

    private final XiaohongshuTextSender textSender;

    private final XiaohongshuMediaReader mediaReader;

    public XiaohongshuAdapter(XiaohongshuProtocol protocol, XiaohongshuCrypto crypto,
                              XiaohongshuTextSender textSender, XiaohongshuMediaReader mediaReader) {
        this.protocol = protocol;
        this.crypto = crypto;
        this.textSender = textSender;
        this.mediaReader = mediaReader;
    }

    @Override
    public ChannelEnum channel() {
        return ChannelEnum.XIAOHONGSHU;
    }

    @Override
    public ChannelCallbackResult verifyUrl(CompanyChannelDO account, Map<String, String> query, HttpHeaders headers) {
        XiaohongshuCredentials credentials = XiaohongshuCredentials.of(account);
        if (credentials == null) {
            return ChannelCallbackResult.unsupported();
        }
        if (!protocol.verify(credentials.token(), query.get("signature"), query.get("timestamp"),
            query.get("nonce"))) {
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
        XiaohongshuCredentials credentials = XiaohongshuCredentials.of(account);
        if (credentials == null) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.unsupported());
        }
        // 推送全部为加密信封（§11.2）：签名材料在 body，字段不齐按参数错误应答
        XiaohongshuEnvelope envelope = protocol.envelopeOf(body);
        if (envelope == null) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
        if (!protocol.verifySignature(credentials.token(), envelope.msgSignature(), envelope.timestamp(),
            envelope.nonce(), envelope.encrypt())) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.rejected());
        }
        String plaintext;
        try {
            XiaohongshuCrypto.PlainMessage plain = crypto.decrypt(credentials.encodingAesKey(), envelope.encrypt());
            // 官方解密步骤：明文尾部 appId（receiveid）须验证与本账号一致
            if (!credentials.appId().equals(plain.appId())) {
                return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
            }
            plaintext = plain.message();
        } catch (IllegalArgumentException e) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
        Optional<ChannelInboundMessage> inbound;
        try {
            inbound = protocol.parse(account.getCompanyChannelId(), plaintext);
        } catch (IllegalArgumentException e) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
        // 事件回调族与无法识别的推送不是访客消息：只按渠道要求应答，不产生访客与消息数据
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
        return XiaohongshuSendCredentials.of(account) == null
            ? XiaohongshuTextSender.SEND_CREDENTIALS_MISSING
            : null;
    }

    @Override
    public String mediaRestriction(CompanyChannelDO account) {
        return XiaohongshuCredentials.of(account) == null
            ? XiaohongshuMediaReader.MEDIA_CREDENTIALS_MISSING
            : null;
    }
}
