package com.dudu.duduserver.channel.telegram;

import com.dudu.duduserver.channel.ChannelAdapter;
import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.channel.ChannelReceiveResult;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Telegram 适配器：组合恒等头验签协议、Bot API 发送与素材读取实现，聚合该渠道的接收
 * 与发送/读取能力说明（事实见 docs/research/channels/telegram.md §3、§4.1、§5.2、§5.3、
 * §6）。官方无 GET 验证握手（§3.2，setWebhook 同步返回 True 即成功），verifyUrl 沿用
 * 接口 default 应答不支持；推送为明文 JSON Update，验签材料在恒等头
 * {@code X-Telegram-Bot-Api-Secret-Token}（无 HMAC 无签名）。凭据住在包内两分组
 * （回调 secretToken 与发送 Bot API 基址 {@code url}，{@link TelegramCredentials} 与
 * {@link TelegramSendCredentials}），缺失按不支持或限制说明如实回答。
 */
@Component
public class TelegramAdapter implements ChannelAdapter {

    // 恒等头名（§4.1 官方拼写逐字）
    private static final String HEADER_SECRET_TOKEN = "X-Telegram-Bot-Api-Secret-Token";

    // 凭据缺失的如实说明：不编造可发可读能力
    private static final String SEND_CREDENTIALS_MISSING = "渠道发送凭据未配置";
    private static final String MEDIA_CREDENTIALS_MISSING = "渠道素材凭据未配置";

    private final TelegramProtocol protocol;

    private final TelegramTextSender textSender;

    private final TelegramMediaReader mediaReader;

    public TelegramAdapter(TelegramProtocol protocol, TelegramTextSender textSender,
                           TelegramMediaReader mediaReader) {
        this.protocol = protocol;
        this.textSender = textSender;
        this.mediaReader = mediaReader;
    }

    @Override
    public ChannelEnum channel() {
        return ChannelEnum.TELEGRAM;
    }

    @Override
    public ChannelReceiveResult receive(CompanyChannelDO account, Map<String, String> query, HttpHeaders headers,
                                        String body) {
        TelegramCredentials credentials = TelegramCredentials.of(account);
        if (credentials == null) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.unsupported());
        }
        if (!protocol.verify(headers.getFirst(HEADER_SECRET_TOKEN), credentials.secretToken())) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.rejected());
        }
        try {
            return protocol.parse(account.getCompanyChannelId(), body);
        } catch (IllegalArgumentException e) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
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
        return TelegramSendCredentials.of(account) == null ? SEND_CREDENTIALS_MISSING : null;
    }

    @Override
    public String mediaRestriction(CompanyChannelDO account) {
        return TelegramSendCredentials.of(account) == null ? MEDIA_CREDENTIALS_MISSING : null;
    }
}
