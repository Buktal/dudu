package com.dudu.duduserver.channel.support;

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
 * 微信族 access_token 换取缓存验收（公众号与小程序同 URL 同协议，事实见
 * docs/research/channels/wechat-mp.md §6、wechat-mini.md §6.1，原两渠道镜像用例合并于此）：
 * 有效期内复用不再请求渠道，剩余不足 30 分钟换新，换取失败不写缓存以便下次重试。
 */
class WechatTokenClientTest {

    private static final String PATH_TOKEN = "/cgi-bin/token";
    private static final String TOKEN_OK = "{\"access_token\":\"family-token\",\"expires_in\":7200}";
    private static final String TOKEN_SHORT_LIFETIME = "{\"access_token\":\"family-short\",\"expires_in\":1200}";
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
        WechatTokenClient<TestCredentials> client = client();

        TokenResult first = client.fetch(credentials());
        TokenResult second = client.fetch(credentials());

        assertThat(first.succeeded()).isTrue();
        assertThat(first.accessToken()).isEqualTo("family-token");
        // 缓存复用：第二次不再请求渠道
        assertThat(second.accessToken()).isEqualTo("family-token");
        assertThat(requestLines).hasSize(1);
        // 凭据按官方口径走 query 参数
        assertThat(requestLines.get(0))
            .isEqualTo("GET " + PATH_TOKEN + "?grant_type=client_credential&appid=wx_test_appid&secret=family-secret");
    }

    @Test
    void refetchesWhenRemainingValidityDropsBelowThirtyMinutes() {
        // expires_in 只有 20 分钟：剩余 <30 分钟，下一次调用应换新
        responseBody = TOKEN_SHORT_LIFETIME;
        WechatTokenClient<TestCredentials> client = client();

        client.fetch(credentials());
        TokenResult refreshed = client.fetch(credentials());

        assertThat(refreshed.succeeded()).isTrue();
        assertThat(refreshed.accessToken()).isEqualTo("family-short");
        assertThat(requestLines).hasSize(2);
    }

    @Test
    void doesNotCacheFailuresSoTheNextFetchRetriesTheChannel() {
        // 换取失败不写缓存：同一客户端下一次调用重新请求渠道并可成功
        responseBody = TOKEN_ERROR;
        WechatTokenClient<TestCredentials> client = client();
        assertThat(client.fetch(credentials()).succeeded()).isFalse();

        responseBody = TOKEN_OK;
        TokenResult retry = client.fetch(credentials());

        assertThat(retry.succeeded()).isTrue();
        assertThat(retry.accessToken()).isEqualTo("family-token");
        assertThat(requestLines).hasSize(2);
    }

    // ---- 夹具 ----

    // 测试凭据：appId/appSecret 两元组，模拟渠道凭据 record 的取值口径
    private record TestCredentials(String appId, String appSecret) {
    }

    private WechatTokenClient<TestCredentials> client() {
        return new WechatTokenClient<>(RestClient.builder().baseUrl(baseUrl).build(),
            TestCredentials::appId, TestCredentials::appSecret);
    }

    private TestCredentials credentials() {
        return new TestCredentials("wx_test_appid", "family-secret");
    }
}
