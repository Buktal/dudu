package com.dudu.duduserver.channel.meituan;

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
 * 美团回调接入验收（docs/research/channels/meituan.md §3、§4.1、§5、§8）：POST 表单推送经
 * 回调服务全链路——验签（签名参数全在表单、待签串含回调 URL）、IM 单聊落库、订单/门店只
 * 应答、伪造签名与缺凭据如实应答；GET 握手按美团无 challenge/verify 口径应答不支持，发送
 * 与素材能力按凭据缺失如实说明。
 */
class MeituanAdapterTest {

    private static final String APP_ID = "mt-app-1";
    private static final String APP_SECRET = "mt-secret-1";
    private static final Long CHANNEL_ID = 4101L;
    private static final String HOST = "callback.dudu.local";
    // 美团无 GET 握手口径（票面要点 6）：适配器不改写 verifyUrl，POST 验签即握手口径
    private static final HttpHeaders REQUEST_HEADERS = headersWithHost();

    private final CompanyChannelService companyChannelService = mock(CompanyChannelService.class);
    private final DeskInboundService deskInboundService = mock(DeskInboundService.class);
    private final MeituanProtocol protocol = new MeituanProtocol();
    private final MeituanAdapter adapter = new MeituanAdapter(protocol,
        new MeituanTextSender(protocol, RestClient.builder(), "http://127.0.0.1:9"),
        new MeituanMediaReader());
    private final ChannelAdapterRegistry registry = new ChannelAdapterRegistry(List.of(adapter));
    private final ChannelCallbackService service =
        new ChannelCallbackServiceImpl(companyChannelService, registry, deskInboundService);

    @BeforeEach
    void stubMeituanAccount() {
        when(companyChannelService.getById(CHANNEL_ID)).thenReturn(meituanAccount(fullInfo()));
    }

    @Test
    void getHandshakeIsUnsupportedBecauseMeituanHasNoChallengeProtocol() {
        ChannelCallbackResult result = service.verifyUrl(String.valueOf(CHANNEL_ID), Map.of(), REQUEST_HEADERS);

        assertThat(result.status()).isEqualTo(501);
    }

    @Test
    void receiveStoresImChatAndAnswersTheUppercaseOk() {
        Map<String, String> form = imChat();
        sign(form);

        ChannelCallbackResult result = service.receive(String.valueOf(CHANNEL_ID), form, REQUEST_HEADERS, "");

        assertThat(result.status()).isEqualTo(200);
        assertThat(result.body()).isEqualTo("{\"data\":\"OK\"}");
        ChannelInboundMessage inbound = capturedInbound();
        assertThat(inbound.companyChannelId()).isEqualTo(CHANNEL_ID);
        assertThat(inbound.externalUserId()).isEqualTo("668921");
        assertThat(inbound.direction()).isEqualTo(MessageDirectionEnum.INCOMING);
        assertThat(inbound.content()).isEqualTo(Map.of("type", "text", "text", "你好，在吗？"));
    }

    @Test
    void receiveAcknowledgesOrderPushWithoutVisitorData() {
        // mock-pulse 推送探针同形（GOLDEN_PROBE_BODY）：order_id 家族按事件只应答小写 ok
        Map<String, String> form = new HashMap<>();
        form.put("app_poi_code", "668921");
        form.put("order_id", "27061900338318741");
        sign(form);

        ChannelCallbackResult result = service.receive(String.valueOf(CHANNEL_ID), form, REQUEST_HEADERS, "");

        assertThat(result.status()).isEqualTo(200);
        assertThat(result.body()).isEqualTo("{\"data\":\"ok\"}");
        verifyNoInteractions(deskInboundService);
    }

    @Test
    void receiveRejectsForgedSignatureAndMissingCredentialsHonestly() {
        Map<String, String> forged = imChat();
        sign(forged);
        forged.put("sig", "0".repeat(32));
        assertThat(service.receive(String.valueOf(CHANNEL_ID), forged, REQUEST_HEADERS, "").status())
            .isEqualTo(403);
        verifyNoInteractions(deskInboundService);

        // 缺 app_secret 无法验签：按不支持应答
        when(companyChannelService.getById(CHANNEL_ID)).thenReturn(meituanAccount(Map.of("app_id", APP_ID)));
        Map<String, String> form = imChat();
        sign(form);
        assertThat(service.receive(String.valueOf(CHANNEL_ID), form, REQUEST_HEADERS, "").status())
            .isEqualTo(501);
        verify(deskInboundService, never()).accept(any(), any());
    }

    @Test
    void restrictionsDescribeMissingCredentialsHonestly() {
        assertThat(adapter.sendRestriction(meituanAccount(Map.of("app_id", APP_ID))))
            .isEqualTo("渠道发送凭据未配置");
        assertThat(adapter.mediaRestriction(meituanAccount(Map.of("app_id", APP_ID))))
            .isEqualTo("渠道素材凭据未配置");
        assertThat(adapter.sendRestriction(meituanAccount(fullInfo()))).isNull();
        assertThat(adapter.mediaRestriction(meituanAccount(fullInfo()))).isNull();
    }

    // IM 单聊表单（§5.4 字段值）：中文推送值按容器一次解码后的形态给出
    private Map<String, String> imChat() {
        Map<String, String> form = new HashMap<>();
        form.put("biz_type", "1");
        form.put("app_poi_code", "668921");
        form.put("push_content", "你好，在吗？");
        form.put("extended_field", "example");
        return form;
    }

    // 按官方五步现算 sig：解码值 + 重建回调 URL（http://host/api/channels/{id}/callback）
    private void sign(Map<String, String> form) {
        form.put("app_id", APP_ID);
        form.put("timestamp", "1760000000");
        String url = "http://" + HOST + "/api/channels/" + CHANNEL_ID + "/callback";
        form.put("sig", protocol.sign(url, form, APP_SECRET));
    }

    private ChannelInboundMessage capturedInbound() {
        ArgumentCaptor<ChannelInboundMessage> captor = ArgumentCaptor.forClass(ChannelInboundMessage.class);
        verify(deskInboundService).accept(any(CompanyChannelDO.class), captor.capture());
        return captor.getValue();
    }

    private CompanyChannelDO meituanAccount(Map<String, Object> info) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(CHANNEL_ID);
        account.setCompanyId(1L);
        account.setChannel(ChannelEnum.MEITUAN);
        account.setAccountName("美团");
        account.setChannelInfo(info);
        return account;
    }

    private Map<String, Object> fullInfo() {
        Map<String, Object> info = new HashMap<>();
        info.put("app_id", APP_ID);
        info.put("app_secret", APP_SECRET);
        return info;
    }

    private static HttpHeaders headersWithHost() {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.HOST, HOST);
        return headers;
    }
}
