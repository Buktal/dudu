package com.dudu.duduserver.channel.wechatmp;

import com.dudu.duduserver.channel.ChannelMediaResult;
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
 * 公众号素材读取实现验证：用本地 HTTP 替身按官方事实构造 access_token 与获取临时素材接口
 * 的成功/失败响应，验证换取凭据、按 media_id 读取字节、视频素材经 video_url 再取一次、
 * 失败说明如实透传渠道错误码；不模拟成功。
 */
class WechatMpMediaReaderTest {

    // 官方返回示例原文形状：成功 {"access_token":"ACCESS_TOKEN","expires_in":7200}
    private static final String TOKEN_OK = "{\"access_token\":\"ACCESS_TOKEN\",\"expires_in\":7200}";
    private static final byte[] IMAGE_BYTES = "fake-jpeg-bytes".getBytes(StandardCharsets.UTF_8);
    private static final byte[] VIDEO_BYTES = "fake-mp4-bytes".getBytes(StandardCharsets.UTF_8);

    private final List<String> requestLines = new CopyOnWriteArrayList<>();
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
    void readsBinaryMediaByChannelIdentifierWithDocumentedCredentials() {
        handleJson("/cgi-bin/token", 200, TOKEN_OK);
        handleBytes("/cgi-bin/media/get", 200, "image/jpeg", IMAGE_BYTES);
        WechatMpMediaReader reader = reader();

        ChannelMediaResult result = reader.read(wechatAccount(
            Map.of("appId", "wx_test_appid", "appSecret", "test-app-secret")), "MEDIA_ID");

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
    void fetchVideoBytesThroughTheChannelSuppliedDownloadUrl() {
        // 官方对视频素材返回 JSON：{"video_url": "下载地址"}，需再取一次字节
        handleJson("/cgi-bin/token", 200, TOKEN_OK);
        handleJson("/cgi-bin/media/get", 200,
            "{\"video_url\":\"" + baseUrl + "/mpvideo/demo\"}");
        handleBytes("/mpvideo/demo", 200, "video/mp4", VIDEO_BYTES);
        WechatMpMediaReader reader = reader();

        ChannelMediaResult result = reader.read(wechatAccount(
            Map.of("appId", "wx_test_appid", "appSecret", "test-app-secret")), "VIDEO_MEDIA_ID");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.bytes()).isEqualTo(VIDEO_BYTES);
        assertThat(result.contentType()).isEqualTo("video/mp4");
        assertThat(requestLines.get(2)).startsWith("GET /mpvideo/demo");
    }

    @Test
    void reportsChannelRejectionWithTheOriginalErrorCodeAndMessage() {
        handleJson("/cgi-bin/token", 200, TOKEN_OK);
        handleJson("/cgi-bin/media/get", 200, "{\"errcode\":40007,\"errmsg\":\"invalid media_id\"}");
        WechatMpMediaReader reader = reader();

        ChannelMediaResult result = reader.read(wechatAccount(
            Map.of("appId", "wx_test_appid", "appSecret", "test-app-secret")), "EXPIRED_ID");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("40007").contains("invalid media_id");
        assertThat(requestLines).hasSize(2);
    }

    @Test
    void reportsTokenFailureWithoutCallingTheMediaEndpoint() {
        handleJson("/cgi-bin/token", 200,
            "{\"errcode\":40164,\"errmsg\":\"invalid ip 1.2.3.4, not in whitelist\"}");
        handleBytes("/cgi-bin/media/get", 200, "image/jpeg", IMAGE_BYTES);
        WechatMpMediaReader reader = reader();

        ChannelMediaResult result = reader.read(wechatAccount(
            Map.of("appId", "wx_test_appid", "appSecret", "test-app-secret")), "MEDIA_ID");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("40164").contains("not in whitelist");
        assertThat(requestLines).hasSize(1);
    }

    @Test
    void reportsTransportFailureInsteadOfPretendingSuccess() {
        // 替身未注册该路径（HTTP 404）：如实记录调用失败，不冒成功
        ChannelMediaResult unbound = reader().read(wechatAccount(
            Map.of("appId", "wx_test_appid", "appSecret", "test-app-secret")), "MEDIA_ID");
        assertThat(unbound.succeeded()).isFalse();
        assertThat(unbound.failureReason()).isNotBlank();

        // 接口返回无法识别的 JSON（既无字节也无 video_url 与 errcode）同样按失败处理
        handleJson("/cgi-bin/token", 200, TOKEN_OK);
        handleJson("/cgi-bin/media/get", 200, "{\"unexpected\":true}");
        ChannelMediaResult unreadable = reader().read(wechatAccount(
            Map.of("appId", "wx_test_appid", "appSecret", "test-app-secret")), "MEDIA_ID");
        assertThat(unreadable.succeeded()).isFalse();
        assertThat(unreadable.failureReason()).isNotBlank();
    }

    @Test
    void refusesAccountsThatCannotReadMediaWithoutCallingTheChannel() {
        ChannelMediaResult missingSecret = reader().read(
            wechatAccount(Map.of("appId", "wx_test_appid")), "MEDIA_ID");
        ChannelMediaResult otherChannel = reader().read(
            account(ChannelEnum.DOUYIN, Map.of("appId", "x", "appSecret", "y")), "MEDIA_ID");

        assertThat(missingSecret.succeeded()).isFalse();
        assertThat(missingSecret.failureReason()).isEqualTo("渠道素材凭据未配置");
        assertThat(otherChannel.succeeded()).isFalse();
        assertThat(otherChannel.failureReason()).isEqualTo("当前渠道暂未接入素材读取");
        assertThat(requestLines).isEmpty();
    }

    private WechatMpMediaReader reader() {
        return new WechatMpMediaReader(RestClient.builder(), baseUrl);
    }

    private CompanyChannelDO wechatAccount(Map<String, Object> channelInfo) {
        return account(ChannelEnum.WECHAT_MP, channelInfo);
    }

    private CompanyChannelDO account(ChannelEnum channel, Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannel(channel);
        account.setChannelInfo(channelInfo);
        return account;
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
