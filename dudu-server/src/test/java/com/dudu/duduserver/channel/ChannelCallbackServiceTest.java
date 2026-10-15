package com.dudu.duduserver.channel;

import cn.hutool.crypto.digest.DigestUtil;
import com.dudu.duduserver.channel.wechatmp.WechatMpAdapter;
import com.dudu.duduserver.channel.wechatmp.WechatMpMediaReader;
import com.dudu.duduserver.channel.wechatmp.WechatMpProtocol;
import com.dudu.duduserver.channel.wechatmp.WechatMpTextSender;
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
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpHeaders;
import org.springframework.web.client.RestClient;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.same;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 渠道回调服务单元验证：账号查找与注册表分派、签名拒绝、未接入协议与事件推送的处理、
 * GET/POST 透传的 headers 原样交给适配器；真实报文与真库落库由 DeskLiveIntegrationTest 覆盖。
 */
class ChannelCallbackServiceTest {

    private static final String TOKEN = "callback-token";
    private static final String TIMESTAMP = "1714037059";
    private static final String NONCE = "486452656";
    private static final Long CHANNEL_ID = 8801L;
    private static final HttpHeaders REQUEST_HEADERS = new HttpHeaders();

    private final CompanyChannelService companyChannelService = mock(CompanyChannelService.class);
    private final DeskInboundService deskInboundService = mock(DeskInboundService.class);
    private final WechatMpAdapter wechatMpAdapter = spy(new WechatMpAdapter(new WechatMpProtocol(),
        new WechatMpTextSender(RestClient.builder(), "http://127.0.0.1:9"),
        new WechatMpMediaReader(RestClient.builder(), "http://127.0.0.1:9")));
    private final ChannelAdapterRegistry registry = new ChannelAdapterRegistry(List.of(wechatMpAdapter));
    private final ChannelCallbackService service =
        new ChannelCallbackServiceImpl(companyChannelService, registry, deskInboundService);

    @BeforeEach
    void stubWechatAccount() {
        when(companyChannelService.getById(CHANNEL_ID)).thenReturn(wechatAccount());
    }

    @Test
    void verifyUrlEchoesEchostrOnlyForValidSignature() {
        Map<String, String> query = signedQuery();
        query.put("echostr", "echo-123");

        ChannelCallbackResult result = service.verifyUrl(String.valueOf(CHANNEL_ID), query, REQUEST_HEADERS);
        assertThat(result.status()).isEqualTo(200);
        assertThat(result.body()).isEqualTo("echo-123");

        Map<String, String> tampered = signedQuery();
        tampered.put("signature", "0".repeat(40));
        tampered.put("echostr", "echo-123");
        assertThat(service.verifyUrl(String.valueOf(CHANNEL_ID), tampered, REQUEST_HEADERS))
            .isEqualTo(ChannelCallbackResult.rejected());
    }

    @Test
    void verifyUrlRejectsUnknownAccountMissingEchostrAndUnsupportedProtocols() {
        assertThat(service.verifyUrl("99999", signedQuery(), REQUEST_HEADERS).status()).isEqualTo(404);
        assertThat(service.verifyUrl("not-a-number", signedQuery(), REQUEST_HEADERS).status()).isEqualTo(404);

        Map<String, String> withoutEcho = signedQuery();
        assertThat(service.verifyUrl(String.valueOf(CHANNEL_ID), withoutEcho, REQUEST_HEADERS).status()).isEqualTo(400);

        when(companyChannelService.getById(CHANNEL_ID)).thenReturn(account(ChannelEnum.DOUYIN, Map.of("token", TOKEN)));
        assertThat(service.verifyUrl(String.valueOf(CHANNEL_ID), signedQuery(), REQUEST_HEADERS).status()).isEqualTo(501);

        when(companyChannelService.getById(CHANNEL_ID)).thenReturn(account(ChannelEnum.WECHAT_MP, Map.of()));
        assertThat(service.verifyUrl(String.valueOf(CHANNEL_ID), signedQuery(), REQUEST_HEADERS).status()).isEqualTo(501);
    }

    @Test
    void receiveStoresParsedTextAndAnswersSuccess() {
        ChannelCallbackResult result = service.receive(String.valueOf(CHANNEL_ID), signedQuery(), REQUEST_HEADERS, """
            <xml><ToUserName><![CDATA[toUser]]></ToUserName><FromUserName><![CDATA[openid-1]]></FromUserName>
            <CreateTime>1348831860</CreateTime><MsgType><![CDATA[text]]></MsgType>
            <Content><![CDATA[你好]]></Content><MsgId>1234567890123456</MsgId></xml>
            """);

        assertThat(result).isEqualTo(ChannelCallbackResult.success());
        ArgumentCaptor<ChannelInboundMessage> captor = ArgumentCaptor.forClass(ChannelInboundMessage.class);
        verify(deskInboundService).accept(any(CompanyChannelDO.class), captor.capture());
        ChannelInboundMessage inbound = captor.getValue();
        assertThat(inbound.companyChannelId()).isEqualTo(CHANNEL_ID);
        assertThat(inbound.externalUserId()).isEqualTo("openid-1");
        assertThat(inbound.externalMessageId()).isEqualTo("1234567890123456");
        assertThat(inbound.direction()).isEqualTo(MessageDirectionEnum.INCOMING);
        assertThat(inbound.content()).isEqualTo(Map.of("type", "text", "text", "你好"));
    }

    @Test
    void receiveRejectsBadSignatureUnsupportedModeAndMalformedBody() {
        Map<String, String> tampered = signedQuery();
        tampered.put("signature", "0".repeat(40));
        assertThat(service.receive(String.valueOf(CHANNEL_ID), tampered, REQUEST_HEADERS, "<xml/>"))
            .isEqualTo(ChannelCallbackResult.rejected());
        verifyNoInteractions(deskInboundService);

        Map<String, String> secure = signedQuery();
        secure.put("encrypt_type", "aes");
        assertThat(service.receive(String.valueOf(CHANNEL_ID), secure, REQUEST_HEADERS, "<xml/>").status()).isEqualTo(501);
        verifyNoInteractions(deskInboundService);

        assertThat(service.receive(String.valueOf(CHANNEL_ID), signedQuery(), REQUEST_HEADERS, "not xml").status())
            .isEqualTo(400);
        verify(deskInboundService, never()).accept(any(), any());
    }

    @Test
    void receiveAcknowledgesEventPushWithoutVisitorData() {
        String event = """
            <xml><ToUserName><![CDATA[toUser]]></ToUserName><FromUserName><![CDATA[FromUser]]></FromUserName>
            <CreateTime>123456789</CreateTime><MsgType><![CDATA[event]]></MsgType>
            <Event><![CDATA[subscribe]]></Event></xml>
            """;

        assertThat(service.receive(String.valueOf(CHANNEL_ID), signedQuery(), REQUEST_HEADERS, event))
            .isEqualTo(ChannelCallbackResult.success());
        verifyNoInteractions(deskInboundService);
    }

    @Test
    void receiveAnswersServerErrorInsteadOfLeakingRWrapperWhenPersistenceFails() {
        // 落库未确认：按渠道协议以 5xx 应答触发重推，不把数据库异常外泄成 R 包装的 HTTP 200
        doThrow(new DuplicateKeyException("uk_message_external"))
            .when(deskInboundService).accept(any(CompanyChannelDO.class), any(ChannelInboundMessage.class));

        assertThat(service.receive(String.valueOf(CHANNEL_ID), signedQuery(), REQUEST_HEADERS, """
            <xml><ToUserName><![CDATA[toUser]]></ToUserName><FromUserName><![CDATA[openid-1]]></FromUserName>
            <CreateTime>1348831860</CreateTime><MsgType><![CDATA[text]]></MsgType>
            <Content><![CDATA[你好]]></Content><MsgId>1234567890123456</MsgId></xml>
            """)).isEqualTo(ChannelCallbackResult.serverError());
    }

    @Test
    void queryAndHeadersArePassedThroughToTheAdapterUntouched() {
        Map<String, String> query = signedQuery();
        query.put("echostr", "echo-pass");
        CompanyChannelDO account = wechatAccount();
        when(companyChannelService.getById(CHANNEL_ID)).thenReturn(account);

        service.verifyUrl(String.valueOf(CHANNEL_ID), query, REQUEST_HEADERS);
        verify(wechatMpAdapter).verifyUrl(same(account), eq(query), same(REQUEST_HEADERS));

        service.receive(String.valueOf(CHANNEL_ID), query, REQUEST_HEADERS, "<xml/>");
        verify(wechatMpAdapter).receive(same(account), eq(query), same(REQUEST_HEADERS), eq("<xml/>"));
    }

    private CompanyChannelDO wechatAccount() {
        return account(ChannelEnum.WECHAT_MP, Map.of("token", TOKEN));
    }

    private CompanyChannelDO account(ChannelEnum channel, Map<String, Object> info) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(CHANNEL_ID);
        account.setCompanyId(1L);
        account.setChannel(channel);
        account.setAccountName("公众号");
        account.setChannelInfo(info);
        return account;
    }

    private Map<String, String> signedQuery() {
        Map<String, String> query = new HashMap<>();
        query.put("timestamp", TIMESTAMP);
        query.put("nonce", NONCE);
        query.put("signature", signature(TOKEN, TIMESTAMP, NONCE));
        return query;
    }

    private String signature(String token, String timestamp, String nonce) {
        String[] parts = {token, timestamp, nonce};
        Arrays.sort(parts);
        return DigestUtil.sha1Hex(String.join("", parts));
    }
}
