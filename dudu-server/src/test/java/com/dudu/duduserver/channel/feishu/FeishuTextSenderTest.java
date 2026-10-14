package com.dudu.duduserver.channel.feishu;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
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
 * 飞书文本发送实现验收（官方 §5.10、§5.11，docs/research/channels/feishu.md）：
 * 先取 tenant_access_token 再 POST /open-apis/im/v1/messages?receive_id_type=open_id，
 * content 为 JSON 序列化字符串、uuid 去重；成功以 code=0 为准并取 data.message_id，
 * 渠道错误原样透出 code 与 msg，凭据缺失与传输失败不冒成功。
 */
class FeishuTextSenderTest {

    // 官方 §5.11 响应形状
    private static final String TOKEN_OK =
        "{\"code\":0,\"msg\":\"ok\",\"tenant_access_token\":\"t-caecc734c2e3328a62489fe0648c4b98779515d3\",\"expire\":7200}";
    // 官方 §5.10 成功响应形状：data.message_id 为渠道消息标识
    private static final String SEND_OK =
        "{\"code\":0,\"msg\":\"success\",\"data\":{\"message_id\":\"om_6740c818900c4b0bbfbc20868a6773bc\"}}";

    private final List<String> requestLines = new CopyOnWriteArrayList<>();
    private final List<String> bodies = new CopyOnWriteArrayList<>();
    private final List<String> authorizations = new CopyOnWriteArrayList<>();
    private HttpServer server;
    private String baseUrl;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void sendsTextWithDocumentedTokenEndpointAndPayloadShape() {
        handle("/open-apis/auth/v3/tenant_access_token/internal", 200, TOKEN_OK);
        handle("/open-apis/im/v1/messages", 200, SEND_OK);

        ChannelSendResult result = sender().send(account(), "ou_84aad35d084aa403a838cf73ee18467", "你好，想咨询发货时间");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.externalMessageId()).isEqualTo("om_6740c818900c4b0bbfbc20868a6773bc");
        assertThat(result.failureReason()).isNull();
        assertThat(requestLines.get(0)).startsWith("POST /open-apis/auth/v3/tenant_access_token/internal");
        JSONObject tokenBody = JSONUtil.parseObj(bodies.get(0));
        assertThat(tokenBody.getStr("app_id")).isEqualTo("cli_9f5343c580712544");
        assertThat(tokenBody.getStr("app_secret")).isEqualTo("dskLLdkasdjlasdKK");

        // 发送报文：receive_id_type=open_id + Bearer 凭据 + content 为 JSON 序列化字符串 + uuid 去重
        assertThat(requestLines.get(1)).startsWith("POST /open-apis/im/v1/messages?receive_id_type=open_id");
        assertThat(authorizations.get(1)).isEqualTo("Bearer t-caecc734c2e3328a62489fe0648c4b98779515d3");
        JSONObject payload = JSONUtil.parseObj(bodies.get(1));
        assertThat(payload.getStr("receive_id")).isEqualTo("ou_84aad35d084aa403a838cf73ee18467");
        assertThat(payload.getStr("msg_type")).isEqualTo("text");
        assertThat(payload.getStr("content")).isEqualTo("{\"text\":\"你好，想咨询发货时间\"}");
        assertThat(payload.getStr("uuid")).isNotBlank();
    }

    @Test
    void reportsChannelRejectionWithTheOriginalErrorCodeAndMessage() {
        handle("/open-apis/auth/v3/tenant_access_token/internal", 200, TOKEN_OK);
        // 官方 §5.10 错误形状：230020 触发限流
        handle("/open-apis/im/v1/messages", 200,
            "{\"code\":230020,\"msg\":\"The message frequency is too high\"}");

        ChannelSendResult result = sender().send(account(), "ou_x", "在吗");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.externalMessageId()).isNull();
        assertThat(result.failureReason()).contains("230020").contains("The message frequency is too high");
    }

    @Test
    void reportsTokenFailureWithoutCallingTheSendEndpoint() {
        handle("/open-apis/auth/v3/tenant_access_token/internal", 200,
            "{\"code\":99991663,\"msg\":\"app id is not found\"}");
        handle("/open-apis/im/v1/messages", 200, SEND_OK);

        ChannelSendResult result = sender().send(account(), "ou_x", "在吗");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("99991663");
        assertThat(requestLines).hasSize(1);
    }

    @Test
    void reportsMissingCredentialsWithoutCallingAnyEndpoint() {
        CompanyChannelDO unconfigured = new CompanyChannelDO();
        unconfigured.setChannel(ChannelEnum.FEISHU);
        unconfigured.setChannelInfo(Map.of("verificationToken", "t"));

        ChannelSendResult result = sender().send(unconfigured, "ou_x", "在吗");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).isEqualTo("渠道发送凭据未配置");
        assertThat(requestLines).isEmpty();
    }

    @Test
    void reportsTransportFailureInsteadOfPretendingSuccess() {
        // 替身未注册发送路径（HTTP 404）：如实记录调用失败，不冒成功
        ChannelSendResult unbound = sender().send(account(), "ou_x", "在吗");
        assertThat(unbound.succeeded()).isFalse();
        assertThat(unbound.failureReason()).isNotBlank();
    }

    // ---- 夹具 ----

    private FeishuTextSender sender() {
        return new FeishuTextSender(RestClient.builder(), baseUrl);
    }

    private CompanyChannelDO account() {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannel(ChannelEnum.FEISHU);
        account.setChannelInfo(Map.of(
            "appId", "cli_9f5343c580712544",
            "appSecret", "dskLLdkasdjlasdKK",
            "verificationToken", "rvaYgkND1GOiu5MM0E1rncYC6PLtF7JV"));
        return account;
    }

    private void handle(String path, int status, String response) {
        server.createContext(path, exchange -> {
            requestLines.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
            bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            authorizations.add(String.valueOf(exchange.getRequestHeaders().getFirst("Authorization")));
            byte[] body = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(status, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
    }
}
