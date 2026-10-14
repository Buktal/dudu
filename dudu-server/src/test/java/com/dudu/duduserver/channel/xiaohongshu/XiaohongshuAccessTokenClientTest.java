package com.dudu.duduserver.channel.xiaohongshu;

import cn.hutool.json.JSONUtil;
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
 * 小红书调用凭证换取缓存验收（事实见 docs/research/channels/xiaohongshu.md §12.2）：官方
 * 规则重复获取使上次凭证失效（5 分钟平滑期后过期），必须缓存复用——有效期内复用不再
 * 请求渠道，剩余不足 30 分钟换新，换取失败不写缓存以便下次重试。
 */
class XiaohongshuAccessTokenClientTest {

    private static final String PATH_TOKEN = "/api/rmp/token";
    private static final String TOKEN_OK =
        "{\"success\":true,\"code\":0,\"msg\":\"success\",\"data\":{\"access_token\":\"xhs-token\",\"expire_in\":7200}}";
    private static final String TOKEN_SHORT_LIFETIME =
        "{\"success\":true,\"code\":0,\"msg\":\"success\",\"data\":{\"access_token\":\"xhs-short\",\"expire_in\":1200}}";
    private static final String TOKEN_ERROR = "{\"success\":false,\"code\":1,\"msg\":\"app not found\"}";

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
        XiaohongshuAccessTokenClient client = client();

        TokenResult first = client.fetch(credentials());
        TokenResult second = client.fetch(credentials());

        assertThat(first.succeeded()).isTrue();
        assertThat(first.accessToken()).isEqualTo("xhs-token");
        // 缓存复用：第二次不再请求渠道（重复获取会使上次凭证失效）
        assertThat(second.accessToken()).isEqualTo("xhs-token");
        assertThat(requestLines).hasSize(1);
        assertThat(requestLines.get(0)).isEqualTo("POST " + PATH_TOKEN);
        // body 按官方请求示例 {appid, secret}
        assertThat(JSONUtil.parseObj(bodies.get(0)).getStr("appid")).isEqualTo("xhs-app-id");
        assertThat(JSONUtil.parseObj(bodies.get(0)).getStr("secret")).isEqualTo("xhs-secret");
    }

    @Test
    void refetchesWhenRemainingValidityDropsBelowThirtyMinutes() {
        // expire_in 只有 20 分钟：剩余 <30 分钟，下一次调用应换新
        responseBody = TOKEN_SHORT_LIFETIME;
        XiaohongshuAccessTokenClient client = client();

        client.fetch(credentials());
        TokenResult refreshed = client.fetch(credentials());

        assertThat(refreshed.succeeded()).isTrue();
        assertThat(refreshed.accessToken()).isEqualTo("xhs-short");
        assertThat(requestLines).hasSize(2);
    }

    @Test
    void doesNotCacheFailuresSoTheNextFetchRetriesTheChannel() {
        // 换取失败不写缓存：同一客户端下一次调用重新请求渠道并可成功
        responseBody = TOKEN_ERROR;
        XiaohongshuAccessTokenClient client = client();
        assertThat(client.fetch(credentials()).succeeded()).isFalse();

        responseBody = TOKEN_OK;
        TokenResult retry = client.fetch(credentials());

        assertThat(retry.succeeded()).isTrue();
        assertThat(retry.accessToken()).isEqualTo("xhs-token");
        assertThat(requestLines).hasSize(2);
    }

    // ---- 夹具 ----

    private XiaohongshuAccessTokenClient client() {
        return new XiaohongshuAccessTokenClient(RestClient.builder().baseUrl(baseUrl).build());
    }

    private XiaohongshuSendCredentials credentials() {
        return new XiaohongshuSendCredentials("xhs-app-id", "xhs-secret");
    }
}
