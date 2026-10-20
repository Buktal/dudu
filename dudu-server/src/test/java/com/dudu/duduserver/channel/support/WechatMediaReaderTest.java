package com.dudu.duduserver.channel.support;

import com.dudu.duduserver.channel.ChannelMediaResult;
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
 * 微信族素材读取骨架验证（公众号与小程序同 URL 同协议，事实见 docs/research/channels/
 * wechat-mp.md §2.1、wechat-mini.md §6.4，原两渠道镜像用例合并于此）：用本地 HTTP 替身按
 * 官方事实构造 access_token 与获取临时素材接口的成功/失败响应，验证换取凭据、按 media_id
 * 读取字节、视频素材经 video_url 再取一次、失败说明如实透传渠道错误码；不模拟成功。
 * video_url 用例以跨源替身强化 8a64097 纪律：二次直取用无 baseUrl 的 downloadClient，
 * 不继承 api-base。
 */
class WechatMediaReaderTest {

    // 官方返回示例原文形状：成功 {"access_token":"ACCESS_TOKEN","expires_in":7200}
    private static final String TOKEN_OK = "{\"access_token\":\"ACCESS_TOKEN\",\"expires_in\":7200}";
    private static final byte[] IMAGE_BYTES = "fake-jpeg-bytes".getBytes(StandardCharsets.UTF_8);
    private static final byte[] VIDEO_BYTES = "fake-mp4-bytes".getBytes(StandardCharsets.UTF_8);

    private final List<String> requestLines = new CopyOnWriteArrayList<>();
    private final List<String> videoOriginLines = new CopyOnWriteArrayList<>();
    private HttpServer server;
    private HttpServer videoOrigin;
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
        if (videoOrigin != null) {
            videoOrigin.stop(0);
        }
    }

    @Test
    void readsBinaryMediaByChannelIdentifierWithDocumentedCredentials() {
        handleJson("/cgi-bin/token", 200, TOKEN_OK);
        handleBytes("/cgi-bin/media/get", 200, "image/jpeg", IMAGE_BYTES);
        WechatMediaReader<TestCredentials> reader = reader();

        ChannelMediaResult result = reader.read(credentials(), 8801L, "MEDIA_ID");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.bytes()).isEqualTo(IMAGE_BYTES);
        assertThat(result.contentType()).isEqualTo("image/jpeg");
        assertThat(requestLines.get(0))
            .startsWith("GET /cgi-bin/token?")
            .contains("grant_type=client_credential")
            .contains("appid=wx_test_appid");
        assertThat(requestLines.get(1))
            .startsWith("GET /cgi-bin/media/get?")
            .contains("access_token=ACCESS_TOKEN")
            .contains("media_id=MEDIA_ID");
    }

    @Test
    void fetchVideoBytesThroughTheChannelSuppliedDownloadUrlWithoutInheritingTheApiBase() throws IOException {
        // 官方对视频素材返回 JSON：{"video_url": 下载地址}，需再取一次字节；地址指向另一
        // 来源的完整 URL，证明二次直取不继承 api-base（downloadClient 无 baseUrl）
        startVideoOrigin();
        handleJson("/cgi-bin/token", 200, TOKEN_OK);
        handleJson("/cgi-bin/media/get", 200,
            "{\"video_url\":\"" + videoOriginBaseUrl() + "/video/demo.mp4\"}");
        handleOnVideoOrigin("/video/demo.mp4", 200, "video/mp4", VIDEO_BYTES);
        WechatMediaReader<TestCredentials> reader = reader();

        ChannelMediaResult result = reader.read(credentials(), 8801L, "VIDEO_MEDIA_ID");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.bytes()).isEqualTo(VIDEO_BYTES);
        assertThat(result.contentType()).isEqualTo("video/mp4");
        assertThat(videoOriginLines).hasSize(1);
        assertThat(videoOriginLines.get(0)).startsWith("GET /video/demo.mp4");
        // api-base 一侧只收到换取凭据与读取素材两次请求，没有二次直取
        assertThat(requestLines).hasSize(2);
    }

    @Test
    void reportsChannelRejectionWithTheOriginalErrorCodeAndMessage() {
        handleJson("/cgi-bin/token", 200, TOKEN_OK);
        handleJson("/cgi-bin/media/get", 200, "{\"errcode\":40007,\"errmsg\":\"invalid media_id\"}");
        WechatMediaReader<TestCredentials> reader = reader();

        ChannelMediaResult result = reader.read(credentials(), 8801L, "EXPIRED_ID");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("40007").contains("invalid media_id");
        assertThat(requestLines).hasSize(2);
    }

    @Test
    void reportsTokenFailureWithoutCallingTheMediaEndpoint() {
        handleJson("/cgi-bin/token", 200,
            "{\"errcode\":40164,\"errmsg\":\"invalid ip 1.2.3.4, not in whitelist\"}");
        handleBytes("/cgi-bin/media/get", 200, "image/jpeg", IMAGE_BYTES);
        WechatMediaReader<TestCredentials> reader = reader();

        ChannelMediaResult result = reader.read(credentials(), 8801L, "MEDIA_ID");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("40164").contains("not in whitelist");
        assertThat(requestLines).hasSize(1);
    }

    @Test
    void reportsTransportFailureInsteadOfPretendingSuccess() {
        // 替身未注册该路径（HTTP 404）：如实记录调用失败，不冒成功
        ChannelMediaResult unbound = reader().read(credentials(), 8801L, "MEDIA_ID");
        assertThat(unbound.succeeded()).isFalse();
        assertThat(unbound.failureReason()).isNotBlank();

        // 接口返回无法识别的 JSON（既无字节也无 video_url 与 errcode）同样按失败处理
        handleJson("/cgi-bin/token", 200, TOKEN_OK);
        handleJson("/cgi-bin/media/get", 200, "{\"unexpected\":true}");
        ChannelMediaResult unreadable = reader().read(credentials(), 8801L, "MEDIA_ID");
        assertThat(unreadable.succeeded()).isFalse();
        assertThat(unreadable.failureReason()).isNotBlank();
    }

    // ---- 夹具 ----

    // 测试凭据：appId/appSecret 两元组，模拟渠道凭据 record 的取值口径
    private record TestCredentials(String appId, String appSecret) {
    }

    private WechatMediaReader<TestCredentials> reader() {
        return new WechatMediaReader<>(RestClient.builder(), baseUrl, "wechat-test",
            TestCredentials::appId, TestCredentials::appSecret);
    }

    private TestCredentials credentials() {
        return new TestCredentials("wx_test_appid", "test-app-secret");
    }

    // 视频二次直取的独立来源：与 api-base 不同源才能证明直取不继承 baseUrl
    private void startVideoOrigin() throws IOException {
        videoOrigin = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        videoOrigin.start();
    }

    private String videoOriginBaseUrl() {
        return "http://127.0.0.1:" + videoOrigin.getAddress().getPort();
    }

    private void handleOnVideoOrigin(String path, int status, String contentType, byte[] response) {
        videoOrigin.createContext(path, exchange -> {
            videoOriginLines.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.sendResponseHeaders(status, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
    }

    // 本地替身：按路径记录请求行，返回构造好的官方形状响应
    private void handleJson(String path, int status, String response) {
        handle(path, status, "application/json; charset=utf-8", response.getBytes(StandardCharsets.UTF_8));
    }

    private void handleBytes(String path, int status, String contentType, byte[] response) {
        handle(path, status, contentType, response);
    }

    private void handle(String path, int status, String contentType, byte[] response) {
        server.createContext(path, exchange -> {
            requestLines.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.sendResponseHeaders(status, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
    }
}
