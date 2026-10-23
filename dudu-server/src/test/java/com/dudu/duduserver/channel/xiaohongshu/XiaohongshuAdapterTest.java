package com.dudu.duduserver.channel.xiaohongshu;

import cn.hutool.crypto.digest.DigestUtil;
import com.dudu.duduserver.channel.ChannelAdapterRegistry;
import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.channel.support.DirectHttpMediaReader;
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
 * 小红书回调接入验收（docs/research/channels/xiaohongshu.md §10、§11）：经渠道回调服务走
 * 官方公式验签、加密信封接收（签名材料在 body、Timestamp 为数字，包形对拍 mock-pulse
 * build_crypto_push）、事件只应答、缺凭据/验签失败/密文损坏/尾部 appId 不符的如实应答；
 * 发送与素材能力按各自凭据缺失如实说明。密文用本包实现按黄金参数构造，签名按官方公式
 * 独立复算。
 */
class XiaohongshuAdapterTest {

    // mock-pulse 黄金常量（tests/mod.rs）
    private static final String TOKEN = "xhsTestToken";
    private static final String ENCODING_AES_KEY = "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C";
    private static final String APP_ID = "wx5823bf96d3bd56c7";
    private static final String TIMESTAMP = "1648714429";
    private static final String NONCE = "0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d";
    private static final Long CHANNEL_ID = 8804L;
    private static final HttpHeaders REQUEST_HEADERS = new HttpHeaders();
    private static final byte[] FIXED_RANDOM = "xhs-golden-rand1".getBytes();

    private final CompanyChannelService companyChannelService = mock(CompanyChannelService.class);
    private final DeskInboundService deskInboundService = mock(DeskInboundService.class);
    private final XiaohongshuCrypto crypto = new XiaohongshuCrypto();
    private final XiaohongshuAdapter adapter = new XiaohongshuAdapter(new XiaohongshuProtocol(), crypto,
        new XiaohongshuTextSender(RestClient.builder(), "http://127.0.0.1:9"),
        new DirectHttpMediaReader(RestClient.builder()));
    private final ChannelAdapterRegistry registry = new ChannelAdapterRegistry(List.of(adapter));
    private final ChannelCallbackService service =
        new ChannelCallbackServiceImpl(companyChannelService, registry, deskInboundService);

    @BeforeEach
    void stubXiaohongshuAccount() {
        when(companyChannelService.getById(CHANNEL_ID)).thenReturn(xiaohongshuAccount(fullInfo()));
    }

    @Test
    void verifyUrlEchoesEchostrOnlyForValidSignature() {
        Map<String, String> query = handshakeQuery();
        query.put("echostr", "echo-123");
        ChannelCallbackResult result = service.verifyUrl(String.valueOf(CHANNEL_ID), query, REQUEST_HEADERS);
        assertThat(result.status()).isEqualTo(200);
        assertThat(result.body()).isEqualTo("echo-123");

        Map<String, String> tampered = handshakeQuery();
        tampered.put("signature", "0".repeat(40));
        tampered.put("echostr", "echo-123");
        assertThat(service.verifyUrl(String.valueOf(CHANNEL_ID), tampered, REQUEST_HEADERS))
            .isEqualTo(ChannelCallbackResult.rejected());

        when(companyChannelService.getById(CHANNEL_ID)).thenReturn(xiaohongshuAccount(Map.of()));
        assertThat(service.verifyUrl(String.valueOf(CHANNEL_ID), handshakeQuery(), REQUEST_HEADERS).status())
            .isEqualTo(501);
    }

    @Test
    void receiveAcceptsSignedEncryptedPushAndStoresText() {
        String plaintext = "{\"MsgId\":\"MSG_ID\",\"FromOpenId\":\"USER_OPEN_ID\","
            + "\"ToAppId\":\"" + APP_ID + "\",\"MsgType\":\"text\",\"CreateTime\":1648714429,"
            + "\"Content\":\"你好，请问这款有货吗\"}";
        String cipher = crypto.encrypt(ENCODING_AES_KEY, FIXED_RANDOM, plaintext, APP_ID);

        ChannelCallbackResult result = service.receive(String.valueOf(CHANNEL_ID), Map.of(), REQUEST_HEADERS,
            encryptedEnvelope(cipher));

        assertThat(result).isEqualTo(ChannelCallbackResult.success());
        ArgumentCaptor<ChannelInboundMessage> captor = ArgumentCaptor.forClass(ChannelInboundMessage.class);
        verify(deskInboundService).accept(any(CompanyChannelDO.class), captor.capture());
        ChannelInboundMessage inbound = captor.getValue();
        assertThat(inbound.companyChannelId()).isEqualTo(CHANNEL_ID);
        assertThat(inbound.externalUserId()).isEqualTo("USER_OPEN_ID");
        assertThat(inbound.externalMessageId()).isEqualTo("MSG_ID");
        assertThat(inbound.direction()).isEqualTo(MessageDirectionEnum.INCOMING);
        assertThat(inbound.content()).isEqualTo(Map.of("type", "text", "text", "你好，请问这款有货吗"));
    }

    @Test
    void receiveAcknowledgesEventFamilyWithoutVisitorData() {
        String event = "{\"Event\":\"note_publish\",\"FromOpenId\":\"USER_OPEN_ID\"}";
        String cipher = crypto.encrypt(ENCODING_AES_KEY, FIXED_RANDOM, event, APP_ID);

        assertThat(service.receive(String.valueOf(CHANNEL_ID), Map.of(), REQUEST_HEADERS,
            encryptedEnvelope(cipher))).isEqualTo(ChannelCallbackResult.success());
        verifyNoInteractions(deskInboundService);
    }

    @Test
    void receiveRejectsTamperedSignatureAndMalformedEnvelope() {
        // MsgSignature 不符：四参签名（token/timestamp/nonce/Encrypt）比对失败按拒绝应答
        String cipher = crypto.encrypt(ENCODING_AES_KEY, FIXED_RANDOM,
            "{\"MsgType\":\"text\",\"FromOpenId\":\"u\",\"Content\":\"hi\"}", APP_ID);
        String forged = "{\"Nonce\":\"" + NONCE + "\",\"Timestamp\":" + TIMESTAMP
            + ",\"Encrypt\":\"" + cipher + "\",\"MsgSignature\":\"" + "0".repeat(40) + "\"}";
        assertThat(service.receive(String.valueOf(CHANNEL_ID), Map.of(), REQUEST_HEADERS, forged))
            .isEqualTo(ChannelCallbackResult.rejected());
        verifyNoInteractions(deskInboundService);

        // 信封字段不齐/非 JSON：按参数错误应答
        assertThat(service.receive(String.valueOf(CHANNEL_ID), Map.of(), REQUEST_HEADERS, "not-json").status())
            .isEqualTo(400);
        assertThat(service.receive(String.valueOf(CHANNEL_ID), Map.of(), REQUEST_HEADERS,
            "{\"Nonce\":\"n\"}").status()).isEqualTo(400);
        verify(deskInboundService, never()).accept(any(), any());
    }

    @Test
    void receiveRejectsBrokenCiphertextAndForeignAppId() {
        // 签名对得上但密文损坏：解密失败按参数错误应答
        assertThat(service.receive(String.valueOf(CHANNEL_ID), Map.of(), REQUEST_HEADERS,
            encryptedEnvelope("ciphertext")).status()).isEqualTo(400);

        // 尾部 appId 须与本账号一致（官方解密步骤 receiveid=appId）：他用密文按参数错误应答
        String foreign = crypto.encrypt(ENCODING_AES_KEY, FIXED_RANDOM,
            "{\"MsgType\":\"text\",\"FromOpenId\":\"u\",\"Content\":\"hi\"}", "wx_other_appid");
        assertThat(service.receive(String.valueOf(CHANNEL_ID), Map.of(), REQUEST_HEADERS,
            encryptedEnvelope(foreign)).status()).isEqualTo(400);
        verify(deskInboundService, never()).accept(any(), any());
    }

    @Test
    void receiveWithoutCallbackCredentialsAnswersUnsupported() {
        when(companyChannelService.getById(CHANNEL_ID)).thenReturn(
            xiaohongshuAccount(Map.of("url", "https://desk.example/callback")));
        assertThat(service.receive(String.valueOf(CHANNEL_ID), Map.of(), REQUEST_HEADERS,
            encryptedEnvelope("ciphertext")).status()).isEqualTo(501);
        verifyNoInteractions(deskInboundService);
    }

    @Test
    void sendAndReadMediaGateOnTheirOwnCredentialsAndRestrictionsDescribeThem() {
        // 发送凭据（appId/appSecret）缺失：经注册表先被 restriction 拦截，如实失败
        ChannelSendResult send = registry.send(xiaohongshuAccount(
                Map.of("token", TOKEN, "encodingAesKey", ENCODING_AES_KEY, "appId", APP_ID)),
            "USER_OPEN_ID", "在吗");
        assertThat(send.succeeded()).isFalse();
        assertThat(send.failureReason()).contains("发送凭据未配置");

        // 素材读取凭据（回调三件套）缺失：同样先被 restriction 拦截
        ChannelMediaResult media = registry.readMedia(
            xiaohongshuAccount(Map.of("appId", APP_ID, "appSecret", "s")), "https://img.example/a.jpg");
        assertThat(media.succeeded()).isFalse();
        assertThat(media.failureReason()).contains("素材凭据未配置");

        assertThat(adapter.sendRestriction(xiaohongshuAccount(Map.of("appId", APP_ID))))
            .isEqualTo("渠道发送凭据未配置");
        assertThat(adapter.sendRestriction(xiaohongshuAccount(
                Map.of("appId", APP_ID, "appSecret", "s")))).isNull();
        assertThat(adapter.mediaRestriction(xiaohongshuAccount(Map.of("appId", APP_ID, "appSecret", "s"))))
            .isEqualTo("渠道素材凭据未配置");
        assertThat(adapter.mediaRestriction(fullAccount())).isNull();
    }

    private CompanyChannelDO fullAccount() {
        return xiaohongshuAccount(fullInfo());
    }

    private CompanyChannelDO xiaohongshuAccount(Map<String, Object> info) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(CHANNEL_ID);
        account.setCompanyId(1L);
        account.setChannel(ChannelEnum.XIAOHONGSHU);
        account.setAccountName("小红书");
        account.setChannelInfo(info);
        return account;
    }

    private Map<String, Object> fullInfo() {
        return Map.of("url", "https://desk.example/api/channels/xhs/callback", "token", TOKEN,
            "appId", APP_ID, "appSecret", "test-secret", "encodingAesKey", ENCODING_AES_KEY);
    }

    // 握手 query：三参 signature（§10.4）
    private Map<String, String> handshakeQuery() {
        Map<String, String> query = new java.util.HashMap<>();
        query.put("timestamp", TIMESTAMP);
        query.put("nonce", NONCE);
        String[] parts = {TOKEN, TIMESTAMP, NONCE};
        Arrays.sort(parts);
        query.put("signature", DigestUtil.sha1Hex(String.join("", parts)));
        return query;
    }

    // 加密推送 body：签名材料在 body 信封内、Timestamp 为数字（§11.2，对拍 mock-pulse
    // build_crypto_push 的包形）
    private String encryptedEnvelope(String encrypt) {
        String[] parts = {TOKEN, TIMESTAMP, NONCE, encrypt};
        Arrays.sort(parts);
        String msgSignature = DigestUtil.sha1Hex(String.join("", parts));
        return "{\"Nonce\":\"" + NONCE + "\",\"Timestamp\":" + TIMESTAMP
            + ",\"Encrypt\":\"" + encrypt + "\",\"MsgSignature\":\"" + msgSignature + "\"}";
    }
}
