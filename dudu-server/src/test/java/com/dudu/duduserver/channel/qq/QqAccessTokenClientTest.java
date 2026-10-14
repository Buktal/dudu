package com.dudu.duduserver.channel.qq;

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
 * QQ access_token 换取缓存验收（事实见 docs/research/channels/qq.md §5.10/§6）：有效期内
 * 复用不再请求渠道，剩余不足 30 分钟换新，换取失败不写缓存以便下次重试；成功样例的
 * expires_in 是字符串，解析按两者兼容。
 */
class QqAccessTokenClientTest {

    private static final String PATH_TOKEN = "/app/getAppAccessToken";
    private static final String TOKEN_OK =
        "{\"code\":\"0\",\"message\":\"ok\",\"access_token\":\"qq-token\",\"expires_in\":\"7200\"}";
    private static final String TOKEN_SHORT_LIFETIME =
        "{\"code\":\"0\",\"message\":\"ok\",\"access_token\":\"qq-short\",\"expires_in\":\"1200\"}";
    private static final String TOKEN_ERROR = "{\"code\":\"100016\",\"message\":\"invalid appid or secret\"}";

    private final List<String> requestLines = new CopyOnWriteArrayList<>();
    private final List<String> bodies = new CopyOnWriteArrayList<>();
    private HttpServer server;
    private String baseUrl;
    private volatile String responseBody = TOKEN_OK;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(PATH_TOKEN, exchange -> {
            requestLines.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
            bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] body = responseBody.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void reusesCachedTokenWithinValidityWithoutHittingTheChannelAgain() {
        responseBody = TOKEN_OK;
        QqAccessTokenClient client = client();

        QqAccessTokenClient.TokenResult first = client.fetch(credentials());
        QqAccessTokenClient.TokenResult second = client.fetch(credentials());

        assertThat(first.succeeded()).isTrue();
        assertThat(first.accessToken()).isEqualTo("qq-token");
        // 缓存复用：第二次不再请求渠道
        assertThat(second.accessToken()).isEqualTo("qq-token");
        assertThat(requestLines).hasSize(1);
        assertThat(requestLines.get(0)).isEqualTo("POST " + PATH_TOKEN);
        // body 字段按官方口径 appId/clientSecret
        assertThat(JSONUtil.parseObj(bodies.get(0)).getStr("appId")).isEqualTo("qq-app-id");
        assertThat(JSONUtil.parseObj(bodies.get(0)).getStr("clientSecret")).isEqualTo("qq-secret");
    }

    @Test
    void refetchesWhenRemainingValidityDropsBelowThirtyMinutes() {
        // expires_in 是字符串且只有 20 分钟：解析兼容并触发换新
        responseBody = TOKEN_SHORT_LIFETIME;
        QqAccessTokenClient client = client();

        client.fetch(credentials());
        QqAccessTokenClient.TokenResult refreshed = client.fetch(credentials());

        assertThat(refreshed.succeeded()).isTrue();
        assertThat(refreshed.accessToken()).isEqualTo("qq-short");
        assertThat(requestLines).hasSize(2);
    }

    @Test
    void doesNotCacheFailuresSoTheNextFetchRetriesTheChannel() {
        // 换取失败不写缓存：同一客户端下一次调用重新请求渠道并可成功
        responseBody = TOKEN_ERROR;
        QqAccessTokenClient client = client();
        assertThat(client.fetch(credentials()).succeeded()).isFalse();

        responseBody = TOKEN_OK;
        QqAccessTokenClient.TokenResult retry = client.fetch(credentials());

        assertThat(retry.succeeded()).isTrue();
        assertThat(retry.accessToken()).isEqualTo("qq-token");
        assertThat(requestLines).hasSize(2);
    }

    // ---- 夹具 ----

    private QqAccessTokenClient client() {
        return new QqAccessTokenClient(RestClient.builder().baseUrl(baseUrl).build());
    }

    private QqCredentials credentials() {
        return new QqCredentials("qq-app-id", "qq-secret");
    }
}
