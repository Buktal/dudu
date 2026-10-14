package com.dudu.duduserver.channel.wechatmini;

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
 * 小程序 access_token 换取缓存验收（事实见 docs/research/channels/wechat-mini.md §6.1）：
 * 官方要求妥善缓存——有效期内复用不再请求渠道，剩余不足 30 分钟换新，换取失败不写
 * 缓存以便下次重试。
 */
class WechatMiniAccessTokenClientTest {

    private static final String PATH_TOKEN = "/cgi-bin/token";
    private static final String TOKEN_OK = "{\"access_token\":\"mini-token\",\"expires_in\":7200}";
    private static final String TOKEN_SHORT_LIFETIME = "{\"access_token\":\"mini-short\",\"expires_in\":1200}";
    private static final String TOKEN_ERROR = "{\"errcode\":40013,\"errmsg\":\"invalid appid\"}";

    private final List<String> requestLines = new CopyOnWriteArrayList<>();
    private HttpServer server;
    private String baseUrl;
    private volatile String responseBody = TOKEN_OK;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(PATH_TOKEN, exchange -> {
            requestLines.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
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
        WechatMiniAccessTokenClient client = client();

        WechatMiniAccessTokenClient.TokenResult first = client.fetch(credentials());
        WechatMiniAccessTokenClient.TokenResult second = client.fetch(credentials());

        assertThat(first.succeeded()).isTrue();
        assertThat(first.accessToken()).isEqualTo("mini-token");
        // 缓存复用：第二次不再请求渠道
        assertThat(second.accessToken()).isEqualTo("mini-token");
        assertThat(requestLines).hasSize(1);
        // 凭据按官方口径走 query 参数
        assertThat(requestLines.get(0))
            .isEqualTo("GET " + PATH_TOKEN + "?grant_type=client_credential&appid=wx1234567890&secret=mini-secret");
    }

    @Test
    void refetchesWhenRemainingValidityDropsBelowThirtyMinutes() {
        // expires_in 只有 20 分钟：剩余 <30 分钟，下一次调用应换新
        responseBody = TOKEN_SHORT_LIFETIME;
        WechatMiniAccessTokenClient client = client();

        client.fetch(credentials());
        WechatMiniAccessTokenClient.TokenResult refreshed = client.fetch(credentials());

        assertThat(refreshed.succeeded()).isTrue();
        assertThat(refreshed.accessToken()).isEqualTo("mini-short");
        assertThat(requestLines).hasSize(2);
    }

    @Test
    void doesNotCacheFailuresSoTheNextFetchRetriesTheChannel() {
        // 换取失败不写缓存：同一客户端下一次调用重新请求渠道并可成功
        responseBody = TOKEN_ERROR;
        WechatMiniAccessTokenClient client = client();
        assertThat(client.fetch(credentials()).succeeded()).isFalse();

        responseBody = TOKEN_OK;
        WechatMiniAccessTokenClient.TokenResult retry = client.fetch(credentials());

        assertThat(retry.succeeded()).isTrue();
        assertThat(retry.accessToken()).isEqualTo("mini-token");
        assertThat(requestLines).hasSize(2);
    }

    // ---- 夹具 ----

    private WechatMiniAccessTokenClient client() {
        return new WechatMiniAccessTokenClient(RestClient.builder().baseUrl(baseUrl).build());
    }

    private WechatMiniCredentials credentials() {
        return new WechatMiniCredentials("wx1234567890", "mini-secret");
    }
}
