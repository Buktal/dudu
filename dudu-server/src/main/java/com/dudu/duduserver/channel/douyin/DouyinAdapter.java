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
 * refreshToken）住在包内，缺失按不支持或限制说明如实回答。发送与本地图片/视频素材
 * 读取（§8.4 GetIMMessageResource）同为用户授权类接口，可用性随 refreshToken 如实
 * 回答。事实见 docs/research/channels/douyin.md。
 */
@Component
public class DouyinAdapter implements ChannelAdapter {

    // 官方 §4.1 的签名头（无时间戳/随机数参与）
    private static final String HEADER_SIGNATURE = "X-Douyin-Signature";

    // §8.4：可读范围是 http(s) 直链与 user_local 图片/视频（四段复合标识）；分享类
    // image/video（无公开下载接口）、旧两段派生标识（留存消息无会话上下文）与 @-加密
    // 标识（视频 item_id 无公开下载接口）如实返回无下载通道说明
    private static final String NO_DOWNLOAD_CHANNEL =
        DouyinMediaResourceClient.FAILURE_PREFIX + "该素材无官方下载通道（分享类图片/视频与旧版留存的本地素材标识不支持读取）";

    // 发送的用户授权缺口说明（发送与素材读取共用 refreshToken 续期链路，场景化文案在此给出）
    private static final String SEND_REFRESH_TOKEN_MISSING =
        "抖音发送未完成用户授权：channel_info 缺少 refreshToken（需运营完成抖音号授权后录入）";

    // 素材读取的用户授权缺口说明（与发送侧同源，主读取通道为用户授权类接口）
    private static final String MEDIA_REFRESH_TOKEN_MISSING =
        "抖音素材读取未完成用户授权：channel_info 缺少 refreshToken（需运营完成抖音号授权后录入）";

    private final DouyinProtocol protocol;

    private final DouyinTextSender textSender;

    private final DirectHttpMediaReader mediaReader;

    private final DouyinMediaResourceClient mediaResourceClient;

    public DouyinAdapter(DouyinProtocol protocol, DouyinTextSender textSender,
                         DirectHttpMediaReader mediaReader, DouyinMediaResourceClient mediaResourceClient) {
        this.protocol = protocol;
        this.textSender = textSender;
        this.mediaReader = mediaReader;
        this.mediaResourceClient = mediaResourceClient;
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
        // 进入会话页、已读等其余事件只按渠道要求应答，不产生访客与消息数据；
        // im_send_msg（授权号发出消息的同步推送）经 parse 转为 OUTGOING 入站信件
        return acceptOrAnswer(inbound);
    }

    @Override
    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        return textSender.send(account, externalUserId, text);
    }

    @Override
    public ChannelMediaResult readMedia(CompanyChannelDO account, String externalMediaId) {
        // user_local 图片/视频的四段复合标识：经 GetIMMessageResource 换 URL 后取字节（§8.4）
        DouyinProtocol.MediaResource resource = protocol.mediaResourceOf(externalMediaId);
        if (resource != null) {
            return mediaResourceClient.read(account, resource);
        }
        // 其余引用：http(s) 直链照常直取，@-加密标识与旧两段派生标识无下载通道
        return mediaReader.read(account, externalMediaId, NO_DOWNLOAD_CHANNEL, "douyin",
            DouyinMediaResourceClient.FAILURE_PREFIX);
    }

    @Override
    public String sendRestriction(CompanyChannelDO account) {
        DouyinCredentials credentials = DouyinCredentials.of(account);
        if (credentials == null) {
            return ChannelRestrictions.SEND_CREDENTIALS_MISSING;
        }
        // 发送是用户授权类接口：refreshToken 缺失即未完成授权，如实指向授权缺口
        return credentials.refreshToken() == null ? SEND_REFRESH_TOKEN_MISSING : null;
    }

    @Override
    public String mediaRestriction(CompanyChannelDO account) {
        DouyinCredentials credentials = DouyinCredentials.of(account);
        if (credentials == null) {
            return ChannelRestrictions.MEDIA_CREDENTIALS_MISSING;
        }
        // 主读取通道 GetIMMessageResource 是用户授权类接口（§8.4）：refreshToken 缺失
        // 即未完成授权，素材读取整体如实受限
        return credentials.refreshToken() == null ? MEDIA_REFRESH_TOKEN_MISSING : null;
    }
}
