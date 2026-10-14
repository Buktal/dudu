package com.dudu.duduserver.channel.douyin;

import com.dudu.duduserver.channel.support.TokenResult;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 抖音接口凭据换取验收（事实见 docs/research/channels/douyin.md §6、§6.1）：
 * 用 channel_info 的 refreshToken POST /oauth/refresh_token/（form：client_key、
 * client_secret、refresh_token、grant_type=refresh_token）续期 access_token，
 * 进程内按 clientKey+refreshToken 缓存复用、窗口取响应 expires_in；refreshToken 缺失
 * 与渠道错误如实返回原因，access_token（用户授权凭证）不可凭 clientKey/clientSecret
 * 直接换取，同 clientKey 换绑授权后旧缓存不得复用。
 */
class DouyinTokenClientTest {

    // §6：access_token 15 天（expires_in=1296000）
    private static final String REFRESH_OK =
        "{\"data\":{\"access_token\":\"act.1d1021d2aee3d41fee2d2add43456badMFZnrhFhfWotu3Ec\","
            + "\"expires_in\":1296000},\"message\":\"success\",\"code\":0}";

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
    void refreshesAccessTokenWithFormBodyAndCachesForReuse() {
        handle("/oauth/refresh_token/", 200, REFRESH_OK);
        DouyinTokenClient client = client();

        TokenResult first = client.fetch(credentials());
        TokenResult second = client.fetch(credentials());

        assertThat(first.succeeded()).isTrue();
        assertThat(first.accessToken()).isEqualTo("act.1d1021d2aee3d41fee2d2add43456badMFZnrhFhfWotu3Ec");
        // 缓存复用：同一 clientKey+refreshToken 的第二次 fetch 不再出网
        assertThat(second.accessToken()).isEqualTo(first.accessToken());
        assertThat(requestLines).hasSize(1);
        assertThat(requestLines.get(0)).startsWith("POST /oauth/refresh_token/");

        // form-urlencoded 四参（§6）
        java.util.Map<String, String> form = form(bodies.get(0));
        assertThat(form.get("client_key")).isEqualTo("asdfavetgbvasf");
        assertThat(form.get("client_secret")).isEqualTo("9e096e3a2a8b4e0f9c0f");
        assertThat(form.get("refresh_token")).isEqualTo("rft.1d1021d2aee3d41fee2d2ad");
        assertThat(form.get("grant_type")).isEqualTo("refresh_token");
    }

    @Test
    void doesNotShareCachedTokenAcrossRefreshTokensForTheSameClientKey() {
        // access_token 与用户授权绑定：同一 clientKey 换绑（refreshToken 变化）后不得复用
        // 旧缓存，必须按新 refreshToken 重新换取
        handle("/oauth/refresh_token/", 200, REFRESH_OK);
        DouyinTokenClient client = client();

        TokenResult first = client.fetch(credentials());
        TokenResult rebound = client.fetch(
            new DouyinCredentials("asdfavetgbvasf", "9e096e3a2a8b4e0f9c0f", "rft.rebound"));

        assertThat(first.succeeded()).isTrue();
        assertThat(rebound.succeeded()).isTrue();
        // 换绑后重新出网换新授权的 token（按 clientKey 单键缓存的旧实现会直接复用 first）
        assertThat(requestLines).hasSize(2);
        assertThat(form(bodies.get(1)).get("refresh_token")).isEqualTo("rft.rebound");
    }

    @Test
    void reportsMissingRefreshTokenAsAuthorizationGapWithoutCallingTheEndpoint() {
        TokenResult result = client().fetch(
            new DouyinCredentials("asdfavetgbvasf", "9e096e3a2a8b4e0f9c0f", null));

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("用户授权").contains("refreshToken");
        assertThat(requestLines).isEmpty();
    }

    @Test
    void reportsChannelRejectionWithTheOriginalError() {
        // §6 错误码：10010 refresh_token 过期需重新授权
        handle("/oauth/refresh_token/", 200,
            "{\"data\":{\"error_code\":10010,\"description\":\"refresh_token 已过期\"},\"code\":10010}");

        DouyinTokenClient client = client();
        TokenResult first = client.fetch(credentials());
        TokenResult retried = client.fetch(credentials());

        assertThat(first.succeeded()).isFalse();
        assertThat(first.failureReason()).contains("10010").contains("refresh_token 已过期");
        // 失败不缓存：下次重试重新出网
        assertThat(retried.succeeded()).isFalse();
        assertThat(requestLines).hasSize(2);
    }

    @Test
    void reportsTransportFailureInsteadOfPretendingSuccess() {
        // 替身未注册路径（HTTP 404）：如实记录调用失败
        TokenResult result = client().fetch(credentials());
        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).isNotBlank();
    }

    // ---- 夹具 ----

    private DouyinTokenClient client() {
        return new DouyinTokenClient(RestClient.builder().baseUrl(baseUrl).build());
    }

    private DouyinCredentials credentials() {
        return new DouyinCredentials("asdfavetgbvasf", "9e096e3a2a8b4e0f9c0f", "rft.1d1021d2aee3d41fee2d2ad");
    }

    private java.util.Map<String, String> form(String body) {
        java.util.Map<String, String> values = new java.util.LinkedHashMap<>();
        for (String pair : body.split("&")) {
            int eq = pair.indexOf('=');
            values.put(URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8),
                URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8));
        }
        return values;
    }

    private void handle(String path, int status, String response) {
        server.createContext(path, exchange -> {
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
