package com.dudu.duduserver.channel.wechatmp;

import com.dudu.duduserver.channel.support.TokenResult;
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
 * 公众号 access_token 换取缓存验收（事实见 docs/research/channels/wechat-mp.md §6，缓存
 * 口径与同一端点的小程序一致）：有效期内复用不再请求渠道，剩余不足 30 分钟换新，换取
 * 失败不写缓存以便下次重试。
 */
class WechatMpAccessTokenClientTest {

    private static final String PATH_TOKEN = "/cgi-bin/token";
    private static final String TOKEN_OK = "{\"access_token\":\"mp-token\",\"expires_in\":7200}";
    private static final String TOKEN_SHORT_LIFETIME = "{\"access_token\":\"mp-short\",\"expires_in\":1200}";
    private static final String TOKEN_ERROR = "{\"errcode\":40164,\"errmsg\":\"invalid ip 1.2.3.4, not in whitelist\"}";

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
        WechatMpAccessTokenClient client = client();

        TokenResult first = client.fetch(credentials());
        TokenResult second = client.fetch(credentials());

        assertThat(first.succeeded()).isTrue();
        assertThat(first.accessToken()).isEqualTo("mp-token");
        // 缓存复用：第二次不再请求渠道
        assertThat(second.accessToken()).isEqualTo("mp-token");
        assertThat(requestLines).hasSize(1);
        // 凭据按官方口径走 query 参数
        assertThat(requestLines.get(0))
            .isEqualTo("GET " + PATH_TOKEN + "?grant_type=client_credential&appid=wx_test_appid&secret=mp-secret");
    }

    @Test
    void refetchesWhenRemainingValidityDropsBelowThirtyMinutes() {
        // expires_in 只有 20 分钟：剩余 <30 分钟，下一次调用应换新
        responseBody = TOKEN_SHORT_LIFETIME;
        WechatMpAccessTokenClient client = client();

        client.fetch(credentials());
        TokenResult refreshed = client.fetch(credentials());

        assertThat(refreshed.succeeded()).isTrue();
        assertThat(refreshed.accessToken()).isEqualTo("mp-short");
        assertThat(requestLines).hasSize(2);
    }

    @Test
    void doesNotCacheFailuresSoTheNextFetchRetriesTheChannel() {
        // 换取失败不写缓存：同一客户端下一次调用重新请求渠道并可成功
        responseBody = TOKEN_ERROR;
        WechatMpAccessTokenClient client = client();
        assertThat(client.fetch(credentials()).succeeded()).isFalse();

        responseBody = TOKEN_OK;
        TokenResult retry = client.fetch(credentials());

        assertThat(retry.succeeded()).isTrue();
        assertThat(retry.accessToken()).isEqualTo("mp-token");
        assertThat(requestLines).hasSize(2);
    }

    // ---- 夹具 ----

    private WechatMpAccessTokenClient client() {
        return new WechatMpAccessTokenClient(RestClient.builder().baseUrl(baseUrl).build());
    }

    private WechatMpCredentials credentials() {
        return new WechatMpCredentials("wx_test_appid", "mp-secret");
    }
}
