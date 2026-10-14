package com.dudu.duduserver.channel.whatsapp;

import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.channel.ChannelReceiveResult;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.web.client.RestClient;

import java.security.GeneralSecurityException;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * WhatsApp 适配器路由语义验收（协议事实见 docs/research/channels/whatsapp.md）：
 * GET 三参握手（hub.mode/hub.verify_token 校验、hub.challenge 裸值纯文本回显）与
 * POST X-Hub-Signature-256 验签解析经真实协议行走；只配回调三键的账号可收推送，
 * 缺发送凭据的账号发送与素材读取受限。
 */
class WhatsappAdapterTest {

    private static final long CHANNEL_ID = 11202L;
    // 官方 §5.1 信封 + Node 交叉复算签名（mock-pulse whatsapp golden 同源）
    private static final String GOLDEN_APP_SECRET = "whatsapp_app_secret";
    private static final String GOLDEN_VERIFY_TOKEN = "meaty-hammer-7";
    private static final String GOLDEN_CHALLENGE = "1158201444251383";
    private static final String GOLDEN_INBOUND_PLAINTEXT = "{\"object\":\"whatsapp_business_account\","
        + "\"entry\":[{\"id\":\"102290129340398\",\"changes\":[{\"value\":{\"messaging_product\":\"whatsapp\","
        + "\"metadata\":{\"display_phone_number\":\"15550783881\",\"phone_number_id\":\"106540352242922\"},"
        + "\"contacts\":[{\"profile\":{\"name\":\"Sheena Nelson\"},\"wa_id\":\"16505551234\"}],"
        + "\"messages\":[{\"from\":\"16505551234\",\"id\":\"wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTRBNjU5OUFFRTAzODEwMTQ0RgA=\","
        + "\"timestamp\":\"1749416383\",\"type\":\"text\",\"text\":{\"body\":\"Does it come in another color?\"}}]},"
        + "\"field\":\"messages\"}]}]}";
    private static final String GOLDEN_SIGNATURE =
        "sha256=d7cb4e2edfe5a785613849eeccb385976ef6e07b1032943a1a5fd785b13c28c3";

    private final WhatsappAdapter adapter = new WhatsappAdapter(
        new WhatsappProtocol(),
        new WhatsappTextSender(RestClient.builder(), "http://127.0.0.1:1"),
        new WhatsappMediaReader(RestClient.builder(), "http://127.0.0.1:1"));

    @Test
    void channelRoutesThroughWhatsappValue() {
        assertThat(adapter.channel()).isEqualTo(ChannelEnum.WHATSAPP);
    }

    @Test
    void verifyUrlEchoesChallengeBareValueOnlyWhenTokenMatches() {
        // 官方三参齐备且 verify_token 匹配：200 + hub.challenge 裸值（纯文本非 JSON，§3.2）
        ChannelCallbackResult ok = adapter.verifyUrl(account(fullInfo()),
            query("subscribe", GOLDEN_CHALLENGE, GOLDEN_VERIFY_TOKEN), new HttpHeaders());
        assertThat(ok.status()).isEqualTo(200);
        assertThat(ok.body()).isEqualTo(GOLDEN_CHALLENGE);

        // verify_token 不匹配（verify token 与 appSecret 是无关值，混淆即拒绝）
        assertThat(adapter.verifyUrl(account(fullInfo()),
            query("subscribe", GOLDEN_CHALLENGE, "wrong-token"), new HttpHeaders()).status()).isEqualTo(403);
        // hub.mode 非 subscribe 与缺失：拒绝
        assertThat(adapter.verifyUrl(account(fullInfo()),
            query("denied", GOLDEN_CHALLENGE, GOLDEN_VERIFY_TOKEN), new HttpHeaders()).status()).isEqualTo(403);
        assertThat(adapter.verifyUrl(account(fullInfo()),
            Map.of("hub.challenge", GOLDEN_CHALLENGE, "hub.verify_token", GOLDEN_VERIFY_TOKEN),
            new HttpHeaders()).status()).isEqualTo(403);
        // challenge 缺失：参数错误（无值可回显）
        assertThat(adapter.verifyUrl(account(fullInfo()),
            Map.of("hub.mode", "subscribe", "hub.verify_token", GOLDEN_VERIFY_TOKEN),
            new HttpHeaders()).status()).isEqualTo(400);
        // 回调三键缺失的账号：按不支持应答
        assertThat(adapter.verifyUrl(account(Map.of("url", "https://dudu.example.com/callback")),
            query("subscribe", GOLDEN_CHALLENGE, GOLDEN_VERIFY_TOKEN), new HttpHeaders()).status())
            .isEqualTo(501);
    }

    @Test
    void receiveAcceptsSignedInboundAndRejectsUnsigned() {
        // 官方 §5.1 信封 + 交叉复算签名：解析出访客消息并按 success 应答
        ChannelReceiveResult ok = adapter.receive(account(fullInfo()), Map.of(),
            headers(GOLDEN_SIGNATURE), GOLDEN_INBOUND_PLAINTEXT);
        assertThat(ok.message()).isNotNull();
        assertThat(ok.message().externalUserId()).isEqualTo("16505551234");
        assertThat(ok.message().content()).isEqualTo(Map.of("type", "text", "text", "Does it come in another color?"));
        assertThat(ok.response().status()).isEqualTo(200);
        assertThat(ok.response().body()).isEqualTo("success");

        // 签名篡改 / 缺头 / appSecret 换掉：拒绝
        assertThat(adapter.receive(account(fullInfo()), Map.of(),
            headers("sha256=" + "0".repeat(64)), GOLDEN_INBOUND_PLAINTEXT).response().status()).isEqualTo(403);
        assertThat(adapter.receive(account(fullInfo()), Map.of(),
            new HttpHeaders(), GOLDEN_INBOUND_PLAINTEXT).response().status()).isEqualTo(403);
        assertThat(adapter.receive(account(fullInfo("other-secret")), Map.of(),
            headers(GOLDEN_SIGNATURE), GOLDEN_INBOUND_PLAINTEXT).response().status()).isEqualTo(403);

        // 验签通过但报文不可解析：参数错误
        assertThat(adapter.receive(account(fullInfo()), Map.of(),
            headers(goldenSignatureOf("not json")), "not json").response().status()).isEqualTo(400);

        // 回调三键缺失的账号：按不支持应答
        assertThat(adapter.receive(account(Map.of("appSecret", GOLDEN_APP_SECRET)), Map.of(),
            headers(GOLDEN_SIGNATURE), GOLDEN_INBOUND_PLAINTEXT).response().status()).isEqualTo(501);
    }

    @Test
    void receiveAnswersOnlyForStatusPayloadWhenSigned() {
        // statuses（§5.2）签名有效：只应答 success，无访客消息
        String statuses = "{\"object\":\"whatsapp_business_account\",\"entry\":[{\"id\":\"102290129340398\","
            + "\"changes\":[{\"value\":{\"messaging_product\":\"whatsapp\",\"metadata\":{},"
            + "\"statuses\":[{\"id\":\"wamid.HBgLMTY1MDM4Nzk0MzkVAgARGBI3MTE5MjVBOTE3MDk5QUVFM0YA\","
            + "\"status\":\"delivered\",\"timestamp\":\"1750263773\",\"recipient_id\":\"16505551234\"}]},"
            + "\"field\":\"messages\"}]}]}";
        ChannelReceiveResult result = adapter.receive(account(fullInfo()), Map.of(),
            headers(goldenSignatureOf(statuses)), statuses);
        assertThat(result.message()).isNull();
        assertThat(result.response().status()).isEqualTo(200);
        assertThat(result.response().body()).isEqualTo("success");
    }

    @Test
    void sendAndMediaRestrictionsHonestWithoutApiCredentials() {
        // 回调三键齐但缺发送凭据（accessToken/phoneNumberId）：发送与素材读取受限
        assertThat(adapter.sendRestriction(account(fullInfo()))).isNull();
        assertThat(adapter.mediaRestriction(account(fullInfo()))).isNull();
        assertThat(adapter.sendRestriction(account(callbackOnly()))).isEqualTo("渠道发送凭据未配置");
        assertThat(adapter.mediaRestriction(account(callbackOnly()))).isEqualTo("渠道素材凭据未配置");
    }

    // 计算指定 body 的正确签名（HMAC-SHA256，与官方验签同式），供不可预置向量的用例使用
    private String goldenSignatureOf(String body) {
        try {
            javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
            mac.init(new javax.crypto.spec.SecretKeySpec(
                GOLDEN_APP_SECRET.getBytes(java.nio.charset.StandardCharsets.UTF_8), "HmacSHA256"));
            return "sha256=" + java.util.HexFormat.of().formatHex(mac.doFinal(
                body.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    private Map<String, String> query(String mode, String challenge, String token) {
        Map<String, String> query = new HashMap<>();
        query.put("hub.mode", mode);
        query.put("hub.challenge", challenge);
        query.put("hub.verify_token", token);
        return query;
    }

    private HttpHeaders headers(String signature) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Hub-Signature-256", signature);
        return headers;
    }

    private Map<String, Object> fullInfo() {
        return fullInfo(GOLDEN_APP_SECRET);
    }

    private Map<String, Object> fullInfo(String appSecret) {
        Map<String, Object> info = new HashMap<>();
        info.put("url", "https://dudu.example.com/api/channels/1/callback");
        info.put("appSecret", appSecret);
        info.put("verifyToken", GOLDEN_VERIFY_TOKEN);
        info.put("accessToken", "SYSTEM_USER_TOKEN");
        info.put("phoneNumberId", "106540352242922");
        return info;
    }

    private Map<String, Object> callbackOnly() {
        Map<String, Object> info = new HashMap<>();
        info.put("url", "https://dudu.example.com/api/channels/1/callback");
        info.put("appSecret", GOLDEN_APP_SECRET);
        info.put("verifyToken", GOLDEN_VERIFY_TOKEN);
        return info;
    }

    private CompanyChannelDO account(Map<String, Object> info) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(CHANNEL_ID);
        account.setChannelInfo(info);
        return account;
    }
}
