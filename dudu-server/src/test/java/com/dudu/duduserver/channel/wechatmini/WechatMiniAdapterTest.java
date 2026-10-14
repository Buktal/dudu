package com.dudu.duduserver.channel.wechatmini;

import cn.hutool.crypto.digest.DigestUtil;
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

import java.util.Arrays;
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
 * 小程序回调接入验收（docs/research/channels/wechat-mini.md §3、§4）：经渠道回调服务走
 * 官方数值例验签、明文/兼容/安全三模式接收、事件只应答、加密链路缺凭据/验签失败/密文
 * 损坏/尾部 AppID 不符的如实应答；发送与素材能力按凭据缺失如实说明。密文用本包实现按
 * 官方算例参数构造，签名按官方公式独立复算。
 */
class WechatMiniAdapterTest {

    // 官方服务器配置示例值（事实库 §3.2/§5.2）
    private static final String TOKEN = "AAAAA";
    private static final String ENCODING_AES_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    private static final String APP_ID = "wxba5fad812f8e6fb9";
    private static final String TIMESTAMP = "1714112445";
    private static final String NONCE = "415670741";
    private static final Long CHANNEL_ID = 8802L;
    private static final HttpHeaders REQUEST_HEADERS = new HttpHeaders();

    // 官方 §5.3 文本消息 XML（三空格缩进原文），作为加密模式的内层报文
    private static final String TEXT_XML = """
        <xml>
           <ToUserName><![CDATA[toUser]]></ToUserName>
           <FromUserName><![CDATA[fromUser]]></FromUserName>
           <CreateTime>1482048670</CreateTime>
           <MsgType><![CDATA[text]]></MsgType>
           <Content><![CDATA[this is a test]]></Content>
           <MsgId>1234567890123456</MsgId>
        </xml>
        """;
    private static final byte[] FIXED_RANDOM = "707722b803182950".getBytes();

    private final CompanyChannelService companyChannelService = mock(CompanyChannelService.class);
    private final DeskInboundService deskInboundService = mock(DeskInboundService.class);
    private final WechatMiniCrypto crypto = new WechatMiniCrypto();
    private final WechatMiniAdapter adapter = new WechatMiniAdapter(new WechatMiniProtocol(), crypto,
        new WechatMiniTextSender(RestClient.builder(), "http://127.0.0.1:9"),
        new WechatMiniMediaReader(RestClient.builder(), "http://127.0.0.1:9"));
    private final ChannelAdapterRegistry registry = new ChannelAdapterRegistry(List.of(adapter));
    private final ChannelCallbackService service =
        new ChannelCallbackServiceImpl(companyChannelService, registry, deskInboundService);

    @BeforeEach
    void stubMiniProgramAccount() {
        when(companyChannelService.getById(CHANNEL_ID)).thenReturn(miniAccount(fullInfo()));
    }

    @Test
    void verifyUrlEchoesEchostrOnlyForValidSignature() {
        Map<String, String> query = plainQuery();
        query.put("echostr", "echo-123");
        ChannelCallbackResult result = service.verifyUrl(String.valueOf(CHANNEL_ID), query, REQUEST_HEADERS);
        assertThat(result.status()).isEqualTo(200);
        assertThat(result.body()).isEqualTo("echo-123");

        Map<String, String> tampered = plainQuery();
        tampered.put("signature", "0".repeat(40));
        tampered.put("echostr", "echo-123");
        assertThat(service.verifyUrl(String.valueOf(CHANNEL_ID), tampered, REQUEST_HEADERS))
            .isEqualTo(ChannelCallbackResult.rejected());

        when(companyChannelService.getById(CHANNEL_ID)).thenReturn(miniAccount(Map.of()));
        assertThat(service.verifyUrl(String.valueOf(CHANNEL_ID), plainQuery(), REQUEST_HEADERS).status())
            .isEqualTo(501);
    }

    @Test
    void receivePlainModeStoresTextAndAnswersSuccess() {
        ChannelCallbackResult result = service.receive(String.valueOf(CHANNEL_ID), plainQuery(), REQUEST_HEADERS,
            TEXT_XML);

        assertThat(result).isEqualTo(ChannelCallbackResult.success());
        ChannelInboundMessage inbound = capturedInbound();
        assertThat(inbound.companyChannelId()).isEqualTo(CHANNEL_ID);
        assertThat(inbound.externalUserId()).isEqualTo("fromUser");
        assertThat(inbound.externalMessageId()).isEqualTo("1234567890123456");
        assertThat(inbound.direction()).isEqualTo(MessageDirectionEnum.INCOMING);
        assertThat(inbound.content()).isEqualTo(Map.of("type", "text", "text", "this is a test"));
    }

    @Test
    void receivePlainModeAcknowledgesEventWithoutVisitorData() {
        String event = """
            <xml><ToUserName><![CDATA[toUser]]></ToUserName><FromUserName><![CDATA[fromUser]]></FromUserName>
            <CreateTime>1482048670</CreateTime><MsgType><![CDATA[event]]></MsgType>
            <Event><![CDATA[user_enter_tempsession]]></Event><SessionFrom><![CDATA[sessionFrom]]></SessionFrom></xml>
            """;
        assertThat(service.receive(String.valueOf(CHANNEL_ID), plainQuery(), REQUEST_HEADERS, event))
            .isEqualTo(ChannelCallbackResult.success());
        verifyNoInteractions(deskInboundService);
    }

    @Test
    void receivePlainModeRejectsTamperedSignatureAndMalformedBody() {
        Map<String, String> tampered = plainQuery();
        tampered.put("signature", "0".repeat(40));
        assertThat(service.receive(String.valueOf(CHANNEL_ID), tampered, REQUEST_HEADERS, TEXT_XML))
            .isEqualTo(ChannelCallbackResult.rejected());
        verifyNoInteractions(deskInboundService);

        assertThat(service.receive(String.valueOf(CHANNEL_ID), plainQuery(), REQUEST_HEADERS, "not xml").status())
            .isEqualTo(400);
        verify(deskInboundService, never()).accept(any(), any());
    }

    @Test
    void receiveCompatibleModeVerifiesMsgSignatureAndAcceptsDecryptedPayload() {
        // 兼容模式：明文殿后附 Encrypt（mock 同族包形），密文校验用 msg_signature
        String cipher = crypto.encrypt(ENCODING_AES_KEY, FIXED_RANDOM, TEXT_XML, APP_ID);
        String compatibleBody = TEXT_XML.stripTrailing().substring(0, TEXT_XML.stripTrailing().length()
            - "</xml>".length()) + "<Encrypt><![CDATA[" + cipher + "]]></Encrypt>\n</xml>";

        ChannelCallbackResult result = service.receive(String.valueOf(CHANNEL_ID), encryptedQuery(cipher),
            REQUEST_HEADERS, compatibleBody);

        assertThat(result).isEqualTo(ChannelCallbackResult.success());
        assertThat(capturedInbound().content()).isEqualTo(Map.of("type", "text", "text", "this is a test"));
    }

    @Test
    void receiveSecureModeAcceptsXmlEnvelopeOfTheMockBaseline() {
        // 安全模式 XML 信封（mock 基线包形）
        String cipher = crypto.encrypt(ENCODING_AES_KEY, FIXED_RANDOM, TEXT_XML, APP_ID);
        String xmlEnvelope = "<xml><ToUserName><![CDATA[" + APP_ID + "]]></ToUserName>"
            + "<Encrypt><![CDATA[" + cipher + "]]></Encrypt></xml>";
        assertThat(service.receive(String.valueOf(CHANNEL_ID), encryptedQuery(cipher), REQUEST_HEADERS, xmlEnvelope))
            .isEqualTo(ChannelCallbackResult.success());
        ChannelInboundMessage inbound = capturedInbound();
        assertThat(inbound.externalUserId()).isEqualTo("fromUser");
        assertThat(inbound.externalMessageId()).isEqualTo("1234567890123456");
    }

    @Test
    void receiveSecureModeAcceptsOfficialJsonEnvelopeShape() {
        // 官方安全模式 JSON 信封原文形状（§5.2）：数据格式选 JSON 的账号同包不同形
        String cipher = crypto.encrypt(ENCODING_AES_KEY, FIXED_RANDOM, TEXT_XML, APP_ID);
        String jsonEnvelope = "{\"ToUserName\": \"" + APP_ID + "\", \"Encrypt\": \"" + cipher + "\"}";
        assertThat(service.receive(String.valueOf(CHANNEL_ID), encryptedQuery(cipher), REQUEST_HEADERS, jsonEnvelope))
            .isEqualTo(ChannelCallbackResult.success());
        assertThat(capturedInbound().externalMessageId()).isEqualTo("1234567890123456");
    }

    @Test
    void receiveEncryptedModesAnswerHonestlyOnMissingCredentialsBadSignatureAndBrokenCiphertext() {
        // 未配置加解密密钥：加密模式按不支持应答，不猜测明文
        when(companyChannelService.getById(CHANNEL_ID)).thenReturn(
            miniAccount(Map.of("token", TOKEN, "appId", APP_ID)));
        assertThat(service.receive(String.valueOf(CHANNEL_ID), encryptedQuery("ciphertext"), REQUEST_HEADERS,
            "<xml><Encrypt><![CDATA[ciphertext]]></Encrypt></xml>").status()).isEqualTo(501);
        verifyNoInteractions(deskInboundService);
        stubMiniProgramAccount();

        // msg_signature 不符：官方要求密文校验用四参签名，比对失败按拒绝应答
        Map<String, String> badSignature = encryptedQuery("ciphertext");
        badSignature.put("msg_signature", "0".repeat(40));
        assertThat(service.receive(String.valueOf(CHANNEL_ID), badSignature, REQUEST_HEADERS,
            "<xml><Encrypt><![CDATA[ciphertext]]></Encrypt></xml>")).isEqualTo(ChannelCallbackResult.rejected());

        // 签名对得上但密文损坏：解密失败按参数错误应答
        assertThat(service.receive(String.valueOf(CHANNEL_ID), encryptedQuery("ciphertext"), REQUEST_HEADERS,
            "<xml><Encrypt><![CDATA[ciphertext]]></Encrypt></xml>").status()).isEqualTo(400);
        verify(deskInboundService, never()).accept(any(), any());
    }

    @Test
    void receiveEncryptedPayloadOfAnotherMiniProgramIsRejected() {
        // 尾部 AppID 须与本小程序一致（官方解密步骤原文）：他用密文按参数错误应答
        String foreign = crypto.encrypt(ENCODING_AES_KEY, FIXED_RANDOM, TEXT_XML, "wx_other_appid");
        assertThat(service.receive(String.valueOf(CHANNEL_ID), encryptedQuery(foreign), REQUEST_HEADERS,
            "<xml><Encrypt><![CDATA[" + foreign + "]]></Encrypt></xml>").status()).isEqualTo(400);
        verify(deskInboundService, never()).accept(any(), any());
    }

    @Test
    void restrictionsDescribeMissingCredentialsHonestly() {
        assertThat(adapter.sendRestriction(miniAccount(Map.of("appId", "x")))).isEqualTo("渠道发送凭据未配置");
        assertThat(adapter.mediaRestriction(miniAccount(Map.of("appId", "x")))).isEqualTo("渠道素材凭据未配置");
        assertThat(adapter.sendRestriction(miniAccount(Map.of("appId", "x", "appSecret", "y")))).isNull();
        assertThat(adapter.mediaRestriction(miniAccount(Map.of("appId", "x", "appSecret", "y")))).isNull();
    }

    private ChannelInboundMessage capturedInbound() {
        ArgumentCaptor<ChannelInboundMessage> captor = ArgumentCaptor.forClass(ChannelInboundMessage.class);
        verify(deskInboundService).accept(any(CompanyChannelDO.class), captor.capture());
        return captor.getValue();
    }

    private CompanyChannelDO miniAccount(Map<String, Object> info) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(CHANNEL_ID);
        account.setCompanyId(1L);
        account.setChannel(ChannelEnum.WECHAT_MINI);
        account.setAccountName("微信小程序");
        account.setChannelInfo(info);
        return account;
    }

    private Map<String, Object> fullInfo() {
        return Map.of("token", TOKEN, "appId", APP_ID, "appSecret", "test-secret", "encodingAesKey",
            ENCODING_AES_KEY);
    }

    // 明文模式 query：三参 signature（官方 §5.1 口径，openid 等多余参数服务端忽略）
    private Map<String, String> plainQuery() {
        Map<String, String> query = new HashMap<>();
        query.put("timestamp", TIMESTAMP);
        query.put("nonce", NONCE);
        query.put("signature", signature(TOKEN, TIMESTAMP, NONCE));
        return query;
    }

    // 加密模式 query：官方安全模式六参并存（§5.2），密文校验只用 msg_signature
    private Map<String, String> encryptedQuery(String encrypt) {
        Map<String, String> query = plainQuery();
        query.put("openid", "o9AgO5Kd5ggOC-bXrbNODIiE3bGY");
        query.put("encrypt_type", "aes");
        query.put("msg_signature", msgSignature(TOKEN, TIMESTAMP, NONCE, encrypt));
        return query;
    }

    private String signature(String token, String timestamp, String nonce) {
        String[] parts = {token, timestamp, nonce};
        Arrays.sort(parts);
        return DigestUtil.sha1Hex(String.join("", parts));
    }

    private String msgSignature(String token, String timestamp, String nonce, String encrypt) {
        String[] parts = {token, timestamp, nonce, encrypt};
        Arrays.sort(parts);
        return DigestUtil.sha1Hex(String.join("", parts));
    }
}
