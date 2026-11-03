package com.dudu.duduserver.channel.kuaishou;

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
 * 快手智能客服适配器：组合回调协议与纯文本发送，聚合该渠道的接收、发送与读取能力
 * 说明（事实见 docs/research/channels/kuaishou.md §6.5）。推送为 POST 明文 JSON（无
 * GET 握手，地址线下报备），Ks-Sign=MD5(appKey+原始 body) 验签，应答体由渠道定义为
 * {"result":1}；凭据（channel_info 的 appKey/signSecret/accessToken）住在包内，appKey
 * 缺失按不支持应答，发送侧凭据缺失按限制说明如实回答。素材读取为平台侧限制：智能
 * 客服推送的图片素材标识被平台抹除（uri 置空），无官方读取通道，恒返回限制说明。
 */
@Component
public class KuaishouAdapter implements ChannelAdapter {

    // 推送验签头（§6.5.3 逐字：MD5(appKey + entity)，entity 为原始请求体）
    private static final String HEADER_SIGN = "Ks-Sign";

    // 平台侧素材限制（§6.5.2 官方释义「uri: 原uri换为空字符串，其他信息保留」）：
    // 与凭据缺失的限制区分，凭据齐全仍不可读
    private static final String MEDIA_UNAVAILABLE =
        "快手素材读取不可用：平台推送的图片素材标识已被抹除（uri 置空），无官方读取通道";

    private final KuaishouProtocol protocol;

    private final KuaishouTextSender textSender;

    public KuaishouAdapter(KuaishouProtocol protocol, KuaishouTextSender textSender) {
        this.protocol = protocol;
        this.textSender = textSender;
    }

    @Override
    public ChannelEnum channel() {
        return ChannelEnum.KUAISHOU;
    }

    @Override
    public ChannelReceiveResult receive(CompanyChannelDO account, Map<String, String> query, HttpHeaders headers,
                                        String body) {
        KuaishouCredentials credentials = KuaishouCredentials.of(account);
        if (credentials == null) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.unsupported());
        }
        if (!protocol.verify(credentials, headers.getFirst(HEADER_SIGN), body)) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.rejected());
        }
        Optional<ChannelInboundMessage> inbound;
        try {
            inbound = protocol.parse(account.getCompanyChannelId(), body);
        } catch (IllegalArgumentException e) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
        // 心跳与转接/辅助类事件只按渠道要求应答，不产生访客与消息数据
        return acceptOrAnswer(inbound, new ChannelCallbackResult(200, KuaishouProtocol.ACK_BODY));
    }

    @Override
    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        return textSender.send(account, externalUserId, text);
    }

    @Override
    public ChannelMediaResult readMedia(CompanyChannelDO account, String externalMediaId) {
        // 注册表先经 mediaRestriction 拦截（恒平台侧限制），此处仅防御直呼
        return ChannelMediaResult.failed(MEDIA_UNAVAILABLE);
    }

    @Override
    public String sendRestriction(CompanyChannelDO account) {
        KuaishouCredentials credentials = KuaishouCredentials.of(account);
        if (credentials == null) {
            return ChannelRestrictions.SEND_CREDENTIALS_MISSING;
        }
        if (credentials.signSecret() == null) {
            return KuaishouTextSender.SIGN_SECRET_MISSING;
        }
        return credentials.accessToken() == null ? KuaishouTextSender.ACCESS_TOKEN_MISSING : null;
    }

    @Override
    public String mediaRestriction(CompanyChannelDO account) {
        // 平台侧限制：与凭据无关，素材标识被推送协议抹除
        return MEDIA_UNAVAILABLE;
    }
}
