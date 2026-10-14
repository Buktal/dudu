package com.dudu.duduserver.channel.weibo;

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
 * 微博回调接入验收（docs/research/channels/weibo.md §3、§4、§5）：经渠道回调服务走官方
 * 黄金算例验签握手、JSON 明文推送四类消息落库、事件与被@只应答空串、验签失败/报文损坏/
 * 缺密钥的如实应答；发送与素材能力按凭据缺失如实说明。签名按官方黄金算例原值对拍。
 */
class WeiboAdapterTest {

    // 官方黄金算例（新手接入指南页逐字）：握手样例 echostr=dnPdpTZz85
    private static final String APP_SECRET = "xyz123xyz";
    private static final String TIMESTAMP = "1397022061823";
    private static final String NONCE = "57155157";
    private static final String SIGNATURE = "90e4c22c90a58f26526c2dd5b6c56c8822edeaa1";
    private static final String ECHOSTR = "dnPdpTZz85";
    private static final Long CHANNEL_ID = 3101L;
    private static final HttpHeaders REQUEST_HEADERS = new HttpHeaders();

    // 官方 §5.1 纯文本私信载荷原文
    private static final String TEXT_PUSH = """
        {
            "type": "text",
            "receiver_id": 1902538057,
            "sender_id": 2489518277,
            "created_at": "Mon Jul 16 18:09:20 +0800 2012",
            "text": "私信或留言内容",
            "data": {}
        }
        """;

    private final CompanyChannelService companyChannelService = mock(CompanyChannelService.class);
    private final DeskInboundService deskInboundService = mock(DeskInboundService.class);
    private final WeiboAdapter adapter = new WeiboAdapter(new WeiboProtocol(),
        new WeiboTextSender(RestClient.builder(), "http://127.0.0.1:9"),
        new WeiboMediaReader(RestClient.builder(), "http://127.0.0.1:9"));
    private final ChannelAdapterRegistry registry = new ChannelAdapterRegistry(List.of(adapter));
    private final ChannelCallbackService service =
        new ChannelCallbackServiceImpl(companyChannelService, registry, deskInboundService);

    @BeforeEach
    void stubWeiboAccount() {
        when(companyChannelService.getById(CHANNEL_ID)).thenReturn(weiboAccount(fullInfo()));
    }

    @Test
    void verifyUrlEchoesEchostrOnlyForValidSignature() {
        Map<String, String> query = signedQuery();
        query.put("echostr", ECHOSTR);
        ChannelCallbackResult result = service.verifyUrl(String.valueOf(CHANNEL_ID), query, REQUEST_HEADERS);
        assertThat(result.status()).isEqualTo(200);
        assertThat(result.body()).isEqualTo(ECHOSTR);

        Map<String, String> tampered = signedQuery();
        tampered.put("signature", "0".repeat(40));
        tampered.put("echostr", ECHOSTR);
        assertThat(service.verifyUrl(String.valueOf(CHANNEL_ID), tampered, REQUEST_HEADERS))
            .isEqualTo(ChannelCallbackResult.rejected());

        // 缺少 echostr 的握手请求按参数错误应答；缺 App Secret 无法验签，按不支持应答
        Map<String, String> noEchostr = signedQuery();
        assertThat(service.verifyUrl(String.valueOf(CHANNEL_ID), noEchostr, REQUEST_HEADERS).status())
            .isEqualTo(400);
        when(companyChannelService.getById(CHANNEL_ID)).thenReturn(weiboAccount(Map.of("accessToken", "t")));
        assertThat(service.verifyUrl(String.valueOf(CHANNEL_ID), query, REQUEST_HEADERS).status())
            .isEqualTo(501);
    }

    @Test
    void receiveStoresTextAndAnswersEmptyString() {
        // 微博语义：回空串表示已收到不重试，异步走客服消息回复（事实库 §3.3）
        ChannelCallbackResult result = service.receive(String.valueOf(CHANNEL_ID), signedQuery(),
            REQUEST_HEADERS, TEXT_PUSH);

        assertThat(result.status()).isEqualTo(200);
        assertThat(result.body()).isEmpty();
        ChannelInboundMessage inbound = capturedInbound();
        assertThat(inbound.companyChannelId()).isEqualTo(CHANNEL_ID);
        assertThat(inbound.externalUserId()).isEqualTo("2489518277");
        assertThat(inbound.externalMessageId()).isNull();
        assertThat(inbound.direction()).isEqualTo(MessageDirectionEnum.INCOMING);
        assertThat(inbound.content()).isEqualTo(Map.of("type", "text", "text", "私信或留言内容"));
    }

    @Test
    void receiveAcknowledgesEventAndMentionWithoutVisitorData() {
        // 官方 §5.5 关注事件与 §2.2 被@消息：事件侧只应答，不产生访客与消息数据
        String followEvent = """
            {
                "type": "event",
                "receiver_id": 1902538057,
                "sender_id": 2489518277,
                "created_at": "Mon Jul 16 18:09:20 +0800 2012",
                "text": "关注事件消息",
                "data": {
                    "subtype": "follow"
                }
            }
            """;
        String mention = """
            {
                "type": "mention",
                "receiver_id": 1902538057,
                "sender_id": 2489518277,
                "created_at": "Mon Jul 16 18:09:20 +0800 2012",
                "text": "被@的微博或评论文本信息",
                "data": {"subtype": "status", "key": "MENTION_KEY"}
            }
            """;
        ChannelCallbackResult eventResult = service.receive(String.valueOf(CHANNEL_ID), signedQuery(),
            REQUEST_HEADERS, followEvent);
        assertThat(eventResult.status()).isEqualTo(200);
        assertThat(eventResult.body()).isEmpty();
        assertThat(service.receive(String.valueOf(CHANNEL_ID), signedQuery(), REQUEST_HEADERS, mention)
            .status()).isEqualTo(200);
        verifyNoInteractions(deskInboundService);
    }

    @Test
    void receiveRejectsTamperedSignatureAndMalformedBody() {
        Map<String, String> tampered = signedQuery();
        tampered.put("signature", "0".repeat(40));
        assertThat(service.receive(String.valueOf(CHANNEL_ID), tampered, REQUEST_HEADERS, TEXT_PUSH))
            .isEqualTo(ChannelCallbackResult.rejected());
        verifyNoInteractions(deskInboundService);

        assertThat(service.receive(String.valueOf(CHANNEL_ID), signedQuery(), REQUEST_HEADERS, "not json")
            .status()).isEqualTo(400);
        verify(deskInboundService, never()).accept(any(), any());
    }

    @Test
    void restrictionsDescribeMissingCredentialsHonestly() {
        assertThat(adapter.sendRestriction(weiboAccount(Map.of("appSecret", APP_SECRET))))
            .isEqualTo("渠道发送凭据未配置");
        assertThat(adapter.mediaRestriction(weiboAccount(Map.of("appSecret", APP_SECRET))))
            .isEqualTo("渠道素材凭据未配置");
        assertThat(adapter.sendRestriction(weiboAccount(
            Map.of("appSecret", APP_SECRET, "accessToken", "wb-token-1")))).isNull();
        assertThat(adapter.mediaRestriction(weiboAccount(
            Map.of("appSecret", APP_SECRET, "accessToken", "wb-token-1")))).isNull();
    }

    private ChannelInboundMessage capturedInbound() {
        ArgumentCaptor<ChannelInboundMessage> captor = ArgumentCaptor.forClass(ChannelInboundMessage.class);
        verify(deskInboundService).accept(any(CompanyChannelDO.class), captor.capture());
        return captor.getValue();
    }

    private CompanyChannelDO weiboAccount(Map<String, Object> info) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(CHANNEL_ID);
        account.setCompanyId(1L);
        account.setChannel(ChannelEnum.WEIBO);
        account.setAccountName("微博");
        account.setChannelInfo(info);
        return account;
    }

    private Map<String, Object> fullInfo() {
        return Map.of("appSecret", APP_SECRET, "accessToken", "wb-token-1");
    }

    // 回调 query：三参 signature 按 App Secret 验签（每次 POST 推送同样携带）
    private Map<String, String> signedQuery() {
        Map<String, String> query = new HashMap<>();
        query.put("timestamp", TIMESTAMP);
        query.put("nonce", NONCE);
        query.put("signature", SIGNATURE);
        return query;
    }
}
