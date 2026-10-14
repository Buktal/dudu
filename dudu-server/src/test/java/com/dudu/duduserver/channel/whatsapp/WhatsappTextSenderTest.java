package com.dudu.duduserver.channel.whatsapp;

import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * WhatsApp 纯文本发送实现验证（事实见 docs/research/channels/whatsapp.md §5.3/§6）：
 * 本地替身按官方 Messages API 形状应答——受理响应 {contacts, messages:[{id}]}、拒绝响应
 * 非 2xx + {"error":{...}}；验证 Bearer 鉴权、路径 /{version}/{phone_number_id}/messages、
 * 报文字段与失败说明原样透出渠道 error，不模拟成功。
 */
class WhatsappTextSenderTest {

    // 官方受理响应形状（§5.3）：messages[0].id 即 wamid
    private static final String SEND_OK = "{\"messaging_product\":\"whatsapp\",\"contacts\":[{"
        + "\"input\":\"+16315551234\",\"wa_id\":\"16315551234\"}],\"messages\":[{\"id\":\"wamid.SENT1\"}]}";
    // 官方拒绝形状：HTTP 4xx + error 体（Messaging Limits 阶梯超限示例错误码 131047）
    private static final String SEND_REJECTED = "{\"error\":{\"message\":\"(#131047) Re-engagement message\","
        + "\"type\":\"OAuthException\",\"code\":131047,\"error_data\":{\"messaging_product\":\"whatsapp\","
        + "\"details\":\"Message failed to send because more than 24 hours have passed\"},"
        + "\"error_subcode\":2494055,\"error_user_title\":\"\",\"error_user_msg\":\"\",\"href\":\"\"}}";

    private final List<String> requestLines = new CopyOnWriteArrayList<>();
    private final List<String> bodies = new CopyOnWriteArrayList<>();
    private final List<String> authHeaders = new CopyOnWriteArrayList<>();
    private HttpServer server;
    private String baseUrl;
    private volatile int respondStatus = 200;
    private volatile String respondBody = SEND_OK;

    @BeforeEach
    void startServer() throws IOException {
        requestLines.clear();
        bodies.clear();
        authHeaders.clear();
        respondStatus = 200;
        respondBody = SEND_OK;
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        // 官方 §5.3：POST /{version}/{phone_number_id}/messages
        server.createContext("/v23.0/106540352242922/messages", exchange -> {
            requestLines.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
            bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            authHeaders.add(exchange.getRequestHeaders().getFirst("Authorization"));
            respond(exchange, respondStatus, respondBody);
        });
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void sendPostsOfficialTextPayloadAndReturnsWamid() {
        ChannelSendResult result = sender().send(account(), "16315551234", "Hello!");
        assertThat(result.succeeded()).isTrue();
        assertThat(result.externalMessageId()).isEqualTo("wamid.SENT1");
        assertThat(result.failureReason()).isNull();

        // 官方 §5.3 请求形状逐字段
        assertThat(requestLines).containsExactly("POST /v23.0/106540352242922/messages");
        assertThat(authHeaders).containsExactly("Bearer SYSTEM_USER_TOKEN");
        assertThat(bodies).containsExactly("{\"messaging_product\":\"whatsapp\",\"recipient_type\":\"individual\","
            + "\"to\":\"16315551234\",\"type\":\"text\",\"text\":{\"body\":\"Hello!\"}}");
    }

    @Test
    void sendSurfacesChannelErrorBodyAsFailureReason() {
        respondStatus = 400;
        respondBody = SEND_REJECTED;
        ChannelSendResult result = sender().send(account(), "16315551234", "Hello!");
        assertThat(result.succeeded()).isFalse();
        assertThat(result.externalMessageId()).isNull();
        // 渠道原始 error 原样透出：code + message + error_data.details
        assertThat(result.failureReason()).isEqualTo("WhatsApp消息发送失败：131047 (#131047) Re-engagement message"
            + " Message failed to send because more than 24 hours have passed");
    }

    @Test
    void sendFailsHonestlyOnUnrecognizedErrorShapeAndNetworkFailure() {
        // 非 JSON 错误体按状态码与原文说明，不编造渠道语义
        respondStatus = 500;
        respondBody = "upstream unavailable";
        ChannelSendResult result = sender().send(account(), "16315551234", "Hello!");
        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).startsWith("WhatsApp消息发送失败：HTTP 500 upstream unavailable");

        // 不可达端口按调用失败记录
        ChannelSendResult unreachable = new WhatsappTextSender(RestClient.builder(), "http://127.0.0.1:9")
            .send(account(), "16315551234", "Hello!");
        assertThat(unreachable.succeeded()).isFalse();
        assertThat(unreachable.failureReason()).startsWith("WhatsApp接口调用失败：");
    }

    @Test
    void sendWithoutMessagesArrayDoesNotInventMessageId() {
        respondBody = "{\"messaging_product\":\"whatsapp\",\"contacts\":[]}";
        ChannelSendResult result = sender().send(account(), "16315551234", "Hello!");
        assertThat(result.succeeded()).isTrue();
        // 响应缺省不冒充渠道标识
        assertThat(result.externalMessageId()).isNull();
    }

    private WhatsappTextSender sender() {
        return new WhatsappTextSender(RestClient.builder(), baseUrl);
    }

    private CompanyChannelDO account() {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(11203L);
        account.setChannelInfo(Map.of(
            "url", "https://dudu.example.com/api/channels/1/callback",
            "appSecret", "whatsapp_app_secret",
            "verifyToken", "meaty-hammer-7",
            "accessToken", "SYSTEM_USER_TOKEN",
            "phoneNumberId", "106540352242922"));
        return account;
    }

    private void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
