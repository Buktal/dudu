package com.dudu.duduserver.channel.douyin;

import com.dudu.duduserver.channel.ChannelAdapter;
import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.channel.ChannelReceiveResult;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.channel.support.ChannelRestrictions;
import com.dudu.duduserver.channel.support.DirectHttpMediaReader;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;

/**
 * 抖音适配器：组合回调协议、纯文本发送与素材读取，聚合该渠道的接收、发送与读取能力
 * 说明。抖音只有 POST Webhooks 回调（官方 §3）：verify_webhook 握手与事件推送共用
 * X-Douyin-Signature 验签（sha1(client_secret + body)），握手按数字 challenge 原样
 * 回显、事件推送解析后交业务层落库；凭据（channel_info 的 clientKey/clientSecret/
 * refreshToken）住在包内，缺失按不支持或限制说明如实回答。发送是用户授权类接口，
 * 可用性随 refreshToken 如实回答。事实见 docs/research/channels/douyin.md。
 */
@Component
public class DouyinAdapter implements ChannelAdapter {

    // 官方 §4.1 的签名头（无时间戳/随机数参与）
    private static final String HEADER_SIGNATURE = "X-Douyin-Signature";

    // §6.2：可读范围只有 CDN 直链标识；派生标识（图片载荷无素材标识）与 @-加密标识
    // （视频 item_id 无公开下载接口）如实返回无下载通道说明
    private static final String NO_DOWNLOAD_CHANNEL =
        "抖音素材读取失败：该素材无官方下载通道（图片载荷不含素材标识，视频分享无公开下载接口）";
    private static final String MEDIA_FAILURE_PREFIX = "抖音素材读取失败：";

    private final DouyinProtocol protocol;

    private final DouyinTextSender textSender;

    private final DirectHttpMediaReader mediaReader;

    public DouyinAdapter(DouyinProtocol protocol, DouyinTextSender textSender,
                         DirectHttpMediaReader mediaReader) {
        this.protocol = protocol;
        this.textSender = textSender;
        this.mediaReader = mediaReader;
    }

    @Override
    public ChannelEnum channel() {
        return ChannelEnum.DOUYIN;
    }

    @Override
    public ChannelReceiveResult receive(CompanyChannelDO account, Map<String, String> query, HttpHeaders headers,
                                        String body) {
        DouyinCredentials credentials = DouyinCredentials.of(account);
        if (credentials == null) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.unsupported());
        }
        if (!protocol.verify(credentials, headers.getFirst(HEADER_SIGNATURE), body)) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.rejected());
        }
        String challenge;
        try {
            challenge = protocol.challengeEcho(body);
        } catch (IllegalArgumentException e) {
            // 握手报文 challenge 缺失或非数字，无法如实回显，按参数错误拒绝
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
        if (challenge != null) {
            // 官方 §3.1：以 {"challenge":<同值>} 回应，值保持数字原样
            return ChannelReceiveResult.answer(new ChannelCallbackResult(200, challenge));
        }
        Optional<ChannelInboundMessage> inbound;
        try {
            inbound = protocol.parse(account.getCompanyChannelId(), body);
        } catch (IllegalArgumentException e) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
        // im_send_msg、进入会话页、已读等其余事件只按渠道要求应答，不产生访客与消息数据
        return acceptOrAnswer(inbound);
    }

    @Override
    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        return textSender.send(account, externalUserId, text);
    }

    @Override
    public ChannelMediaResult readMedia(CompanyChannelDO account, String externalMediaId) {
        return mediaReader.read(account, externalMediaId, NO_DOWNLOAD_CHANNEL, "douyin", MEDIA_FAILURE_PREFIX);
    }

    @Override
    public String sendRestriction(CompanyChannelDO account) {
        DouyinCredentials credentials = DouyinCredentials.of(account);
        if (credentials == null) {
            return ChannelRestrictions.SEND_CREDENTIALS_MISSING;
        }
        // 发送是用户授权类接口：refreshToken 缺失即未完成授权，如实指向授权缺口
        return credentials.refreshToken() == null ? DouyinTokenClient.REFRESH_TOKEN_MISSING : null;
    }

    @Override
    public String mediaRestriction(CompanyChannelDO account) {
        // 素材读取只依赖应用凭据（直链下载），不依赖用户授权
        return DouyinCredentials.of(account) == null ? ChannelRestrictions.MEDIA_CREDENTIALS_MISSING : null;
    }
}
