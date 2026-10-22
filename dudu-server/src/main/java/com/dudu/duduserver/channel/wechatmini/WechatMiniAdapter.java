package com.dudu.duduserver.channel.wechatmini;

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

import static com.dudu.duduserver.channel.support.ChannelInfoText.text;

/**
 * 微信小程序适配器：组合回调验签加解密协议、客服消息纯文本主动回复与临时素材读取，聚合
 * 该渠道的服务器验证、入站接收与发送/读取能力说明（事实见
 * docs/research/channels/wechat-mini.md）。回调配置四要素住在 channel_info：token（三参
 * 验签）、appId 与 encodingAesKey（加解密）、appId/appSecret（换取接口凭据）；明文模式
 * 用三参 signature 校验，兼容/安全模式密文必须用四参 msg_signature 校验并经 AES 解密
 * （官方注意事项：不要使用 signature 验证密文），尾部 AppID 须与本小程序一致。
 */
@Component
public class WechatMiniAdapter implements ChannelAdapter {

    // 服务器配置的 Token，用于三参签名比对
    private static final String INFO_TOKEN = "token";
    private static final String INFO_APP_ID = "appId";
    private static final String INFO_ENCODING_AES_KEY = "encodingAesKey";

    // 兼容/安全模式标识参数与密文四参签名参数；密文校验用 msg_signature 而非 signature
    private static final String PARAM_ENCRYPT_TYPE = "encrypt_type";
    private static final String PARAM_MSG_SIGNATURE = "msg_signature";
    private static final String ENCRYPT_TYPE_AES = "aes";

    private final WechatMiniProtocol protocol;

    private final WechatMiniCrypto crypto;

    private final WechatMiniTextSender textSender;

    private final WechatMiniMediaReader mediaReader;

    public WechatMiniAdapter(WechatMiniProtocol protocol, WechatMiniCrypto crypto,
                             WechatMiniTextSender textSender, WechatMiniMediaReader mediaReader) {
        this.protocol = protocol;
        this.crypto = crypto;
        this.textSender = textSender;
        this.mediaReader = mediaReader;
    }

    @Override
    public ChannelEnum channel() {
        return ChannelEnum.WECHAT_MINI;
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
        if (token == null) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.unsupported());
        }
        String payload = body;
        String encryptType = query.get(PARAM_ENCRYPT_TYPE);
        if (encryptType != null) {
            Decryption decryption = decryptPayload(account, token, query, encryptType, body);
            if (!decryption.succeeded()) {
                return ChannelReceiveResult.answer(decryption.failure());
            }
            payload = decryption.payload();
        } else if (!protocol.verify(token, query.get("signature"), query.get("timestamp"), query.get("nonce"))) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.rejected());
        }
        Optional<ChannelInboundMessage> inbound;
        try {
            inbound = protocol.parse(account.getCompanyChannelId(), payload);
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
        return WechatMiniCredentials.of(account) == null ? ChannelRestrictions.SEND_CREDENTIALS_MISSING : null;
    }

    @Override
    public String mediaRestriction(CompanyChannelDO account) {
        return WechatMiniCredentials.of(account) == null ? ChannelRestrictions.MEDIA_CREDENTIALS_MISSING : null;
    }

    // 加密路径结果：payload 为解出的内层报文；failure 非空表示按该结果应答、不猜测明文
    private record Decryption(String payload, ChannelCallbackResult failure) {

        boolean succeeded() {
            return failure == null;
        }
    }

    // 兼容/安全模式解出内层报文：官方只定义 encrypt_type=aes，其余值与缺密钥/缺 AppID 的
    // 账号按不支持应答。密文校验用 msg_signature（官方注意事项原文：不要使用 signature
    // 验证），解密失败与尾部 AppID 不符都按参数错误应答。
    private Decryption decryptPayload(CompanyChannelDO account, String token, Map<String, String> query,
                                      String encryptType, String body) {
        if (!ENCRYPT_TYPE_AES.equals(encryptType)) {
            return new Decryption(null, ChannelCallbackResult.unsupported());
        }
        Map<String, Object> info = account.getChannelInfo();
        String aesKey = text(info, INFO_ENCODING_AES_KEY);
        String appId = text(info, INFO_APP_ID);
        if (aesKey == null || appId == null) {
            return new Decryption(null, ChannelCallbackResult.unsupported());
        }
        String encrypt = protocol.encryptOf(body);
        if (!protocol.verifySignature(token, query.get(PARAM_MSG_SIGNATURE), query.get("timestamp"),
            query.get("nonce"), encrypt)) {
            return new Decryption(null, ChannelCallbackResult.rejected());
        }
        try {
            WechatMiniCrypto.PlainMessage plain = crypto.decrypt(aesKey, encrypt);
            // 官方解密步骤：明文尾部 appid 须验证与本小程序一致
            if (!appId.equals(plain.appId())) {
                return new Decryption(null, ChannelCallbackResult.badRequest());
            }
            return new Decryption(plain.message(), null);
        } catch (IllegalArgumentException e) {
            return new Decryption(null, ChannelCallbackResult.badRequest());
        }
    }

    // 只配置了回调 Token 的账号可完成握手与明文验签，但没有加解密与换取接口凭据的能力
    private String callbackToken(CompanyChannelDO account) {
        return text(account == null ? null : account.getChannelInfo(), INFO_TOKEN);
    }
}
