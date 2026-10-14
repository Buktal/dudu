package com.dudu.duduserver.channel.telegram;

import com.dudu.duduserver.channel.ChannelAdapterRegistry;
import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.service.ChannelCallbackService;
import com.dudu.duduserver.service.CompanyChannelService;
import com.dudu.duduserver.service.DeskInboundService;
import com.dudu.duduserver.service.impl.ChannelCallbackServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpHeaders;
import org.springframework.web.client.RestClient;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Telegram 回调接入验收（docs/research/channels/telegram.md §3、§4.1、§5.2）：Update
 * 推送经回调服务全链路——恒等头验签（无 HMAC 无签名）、message 落库、事件族只应答、
 * 伪造与缺凭据如实应答；GET 握手按官方无 challenge 口径应答不支持，发送与素材能力按
 * 凭据缺失如实说明。
 */
class TelegramAdapterTest {

    private static final Long CHANNEL_ID = 4107L;
    private static final String SECRET_TOKEN = "dudu-secret-token";
    private static final String CALLBACK_URL = "https://dudu.example.com/telegram";
    // 恒等头名（§4.1 官方拼写逐字）
    private static final String SECRET_TOKEN_HEADER = "X-Telegram-Bot-Api-Secret-Token";
    // 官方 §5.2 文本消息自测样本（webhooks 指南逐字）
    private static final String GOLDEN_TEXT_UPDATE = """
        {
        "update_id":10000,
        "message":{
            "date":1441645532,
            "chat":{
               "last_name":"Test Lastname",
               "id":1111111,
               "type": "private",
               "first_name":"Test Firstname",
               "username":"Testusername"
            },
            "message_id":1365,
            "from":{
               "last_name":"Test Lastname",
               "id":1111111,
               "first_name":"Test Firstname",
               "username":"Testusername"
            },
            "text":"/start"
        }
        }""";

    private final CompanyChannelService companyChannelService = mock(CompanyChannelService.class);
    private final DeskInboundService deskInboundService = mock(DeskInboundService.class);
    private final TelegramProtocol protocol = new TelegramProtocol();
    private final TelegramAdapter adapter = new TelegramAdapter(protocol,
        new TelegramTextSender(RestClient.builder()),
        new TelegramMediaReader(RestClient.builder()));
    private final ChannelAdapterRegistry registry = new ChannelAdapterRegistry(List.of(adapter));
    private final ChannelCallbackService service =
        new ChannelCallbackServiceImpl(companyChannelService, registry, deskInboundService);

    @BeforeEach
    void stubTelegramAccount() {
        when(companyChannelService.getById(CHANNEL_ID)).thenReturn(telegramAccount(fullInfo()));
    }

    @Test
    void getHandshakeIsUnsupportedBecauseTelegramHasNoChallengeProtocol() {
        // 官方无验证往返（§3.2）：setWebhook 同步返回 True 即成功，无 GET 握手
        ChannelCallbackResult result = service.verifyUrl(String.valueOf(CHANNEL_ID), Map.of(), new HttpHeaders());

        assertThat(result.status()).isEqualTo(501);
    }

    @Test
    void receiveStoresMessageWhenSecretTokenHeaderMatches() {
        ChannelCallbackResult result = service.receive(String.valueOf(CHANNEL_ID), Map.of(),
            headers(SECRET_TOKEN), GOLDEN_TEXT_UPDATE);

        assertThat(result.status()).isEqualTo(200);
        ChannelInboundMessage inbound = capturedInbound();
        assertThat(inbound.externalUserId()).isEqualTo("1111111");
        assertThat(inbound.externalMessageId()).isEqualTo("10000");
        assertThat(inbound.content()).isEqualTo(Map.of("type", "text", "text", "/start"));
        assertThat(inbound.direction()).isEqualTo(MessageDirectionEnum.INCOMING);
    }

    @Test
    void receiveRejectsForgedOrMissingSecretTokenHeader() {
        // 头值与配置不符：伪造请求
        assertThat(service.receive(String.valueOf(CHANNEL_ID), Map.of(),
            headers("forged-token"), GOLDEN_TEXT_UPDATE).status()).isEqualTo(403);
        // 头缺失：同样拒绝
        assertThat(service.receive(String.valueOf(CHANNEL_ID), Map.of(),
            new HttpHeaders(), GOLDEN_TEXT_UPDATE).status()).isEqualTo(403);
        verifyNoInteractions(deskInboundService);
    }

    @Test
    void receiveAnswersUnsupportedWithoutSecretTokenAndBadRequestForUnusableBody() {
        // 只配 url 缺 secretToken：无法验签按不支持应答
        when(companyChannelService.getById(CHANNEL_ID))
            .thenReturn(telegramAccount(Map.of("url", CALLBACK_URL)));
        assertThat(service.receive(String.valueOf(CHANNEL_ID), Map.of(),
            headers(SECRET_TOKEN), GOLDEN_TEXT_UPDATE).status()).isEqualTo(501);

        // 验签通过但报文缺幂等键：按参数错误应答
        when(companyChannelService.getById(CHANNEL_ID)).thenReturn(telegramAccount(fullInfo()));
        assertThat(service.receive(String.valueOf(CHANNEL_ID), Map.of(),
            headers(SECRET_TOKEN), "{\"message\":{\"text\":\"hi\"}}").status()).isEqualTo(400);
        verify(deskInboundService, never()).accept(any(), any());
    }

    @Test
    void restrictionsDescribeMissingCredentialsHonestly() {
        // 发送组只看 Bot API 基址 url，回调组只看 secretToken——两侧互不依赖（ADR-0013）
        assertThat(adapter.sendRestriction(telegramAccount(Map.of("secretToken", SECRET_TOKEN))))
            .isEqualTo("渠道发送凭据未配置");
        assertThat(adapter.mediaRestriction(telegramAccount(Map.of("secretToken", SECRET_TOKEN))))
            .isEqualTo("渠道素材凭据未配置");
        assertThat(adapter.sendRestriction(telegramAccount(fullInfo()))).isNull();
        assertThat(adapter.mediaRestriction(telegramAccount(fullInfo()))).isNull();
        // 只配 url 的账号发送/素材不受限（发送组凭据齐备，与回调能否验签无关）
        assertThat(adapter.sendRestriction(telegramAccount(Map.of("url", CALLBACK_URL)))).isNull();
        assertThat(adapter.mediaRestriction(telegramAccount(Map.of("url", CALLBACK_URL)))).isNull();
    }

    private ChannelInboundMessage capturedInbound() {
        ArgumentCaptor<ChannelInboundMessage> captor = ArgumentCaptor.forClass(ChannelInboundMessage.class);
        verify(deskInboundService).accept(any(CompanyChannelDO.class), captor.capture());
        return captor.getValue();
    }

    private HttpHeaders headers(String secretToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(SECRET_TOKEN_HEADER, secretToken);
        return headers;
    }

    private CompanyChannelDO telegramAccount(Map<String, Object> info) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(CHANNEL_ID);
        account.setCompanyId(1L);
        account.setChannel(ChannelEnum.TELEGRAM);
        account.setAccountName("Telegram");
        account.setChannelInfo(info);
        return account;
    }

    private Map<String, Object> fullInfo() {
        Map<String, Object> info = new HashMap<>();
        info.put("url", CALLBACK_URL);
        info.put("secretToken", SECRET_TOKEN);
        return info;
    }
}
