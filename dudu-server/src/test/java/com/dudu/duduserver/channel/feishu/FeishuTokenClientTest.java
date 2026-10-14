package com.dudu.duduserver.channel.feishu;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 飞书接口凭据换取验收（官方 §5.11、§6）：POST body 携带 app_id/app_secret，成功
 * 缓存复用（expire 7200 内直接复用），剩余有效期不足 30 分钟换新，渠道错误原样
 * 透出 code 与 msg，缺失 token 与传输失败如实返回不冒成功。
 */
class FeishuTokenClientTest {

    // 官方 §5.11 响应形状：{"code":0,"msg":"ok","tenant_access_token":"t-...","expire":7200}
    private static final String TOKEN_OK =
        "{\"code\":0,\"msg\":\"ok\",\"tenant_access_token\":\"t-caecc734c2e3328a62489fe0648c4b98779515d3\",\"expire\":7200}";

    private final List<String> requestLines = new CopyOnWriteArrayList<>();
    private final List<String> bodies = new CopyOnWriteArrayList<>();
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
    void postsDocumentedBodyAndReusesCachedTokenWithinValidity() {
        handle(200, TOKEN_OK);
        FeishuTokenClient client = client();

        FeishuTokenClient.TokenResult first = client.fetch(credentials());
        FeishuTokenClient.TokenResult second = client.fetch(credentials());

        assertThat(first.succeeded()).isTrue();
        assertThat(first.accessToken()).isEqualTo("t-caecc734c2e3328a62489fe0648c4b98779515d3");
        // 缓存复用：第二次不再请求渠道
        assertThat(second.accessToken()).isEqualTo(first.accessToken());
        assertThat(requestLines).hasSize(1);
        assertThat(requestLines.get(0)).startsWith("POST /open-apis/auth/v3/tenant_access_token/internal");
        JSONObject body = JSONUtil.parseObj(bodies.get(0));
        assertThat(body.getStr("app_id")).isEqualTo("cli_9f5343c580712544");
        assertThat(body.getStr("app_secret")).isEqualTo("dskLLdkasdjlasdKK");
    }

    @Test
    void refetchesWhenRemainingValidityDropsBelowThirtyMinutes() {
        // expire 只有 20 分钟：剩余 <30 分钟，下一次调用应换新（官方 §6 规则）
        handle(200, "{\"code\":0,\"msg\":\"ok\",\"tenant_access_token\":\"t-short\",\"expire\":1200}");
        FeishuTokenClient client = client();

        client.fetch(credentials());
        FeishuTokenClient.TokenResult refreshed = client.fetch(credentials());

        assertThat(refreshed.succeeded()).isTrue();
        assertThat(requestLines).hasSize(2);
    }

    @Test
    void reportsChannelRejectionWithTheOriginalErrorCodeAndMessage() {
        handle(200, "{\"code\":99991663,\"msg\":\"app id is not found\"}");

        FeishuTokenClient.TokenResult result = client().fetch(credentials());

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("99991663").contains("app id is not found");
    }

    @Test
    void reportsMissingTokenFieldInsteadOfPretendingSuccess() {
        // 成功 code 但缺 tenant_access_token 字段
        handle(200, "{\"code\":0,\"msg\":\"ok\"}");
        assertThat(client().fetch(credentials()).failureReason()).contains("tenant_access_token");
    }

    @Test
    void reportsNonJsonResponseInsteadOfPretendingSuccess() {
        // 非 JSON 响应（如网关 HTML）按调用失败处理
        handle(200, "<html>bad gateway</html>");
        assertThat(client().fetch(credentials()).succeeded()).isFalse();
    }

    @Test
    void reportsUnreachableEndpointInsteadOfPretendingSuccess() {
        // 未注册路径（HTTP 404）同样按调用失败处理
        assertThat(client().fetch(credentials()).succeeded()).isFalse();
        assertThat(client().fetch(credentials()).failureReason()).isNotBlank();
    }

    // ---- 夹具 ----

    private FeishuTokenClient client() {
        return new FeishuTokenClient(RestClient.builder().baseUrl(baseUrl).build());
    }

    private FeishuSendCredentials credentials() {
        // 发送组两参：换取 tenant_access_token 只需 appId/appSecret
        return new FeishuSendCredentials("cli_9f5343c580712544", "dskLLdkasdjlasdKK");
    }

    private void handle(int status, String response) {
        server.createContext("/open-apis/auth/v3/tenant_access_token/internal", exchange -> {
            requestLines.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
            bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] body = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(status, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
    }
}
