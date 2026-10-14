package com.dudu.duduserver.channel.weibo;

import com.dudu.duduserver.channel.ChannelMediaResult;
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
 * 微博素材读取验证（docs/research/channels/weibo.md §2.1、§6）：语音/图片私信的接收者侧
 * 文件 ID（tovfid）经 GET /2/mss/msget?access_token=&fid= 下载，成功按二进制返回并带渠道
 * 内容类型；失败响应为 JSON，原样记录 error_code 与 error；缺凭据与调用异常如实说明，
 * 不模拟成功。
 */
class WeiboMediaReaderTest {

    private static final String MEDIA_PATH = "/2/mss/msget";
    private static final byte[] IMAGE_BYTES = "weibo-media-bytes".getBytes(StandardCharsets.UTF_8);

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
    void servesBytesWithContentTypeThroughConfiguredCredentials() {
        handleBinary(MEDIA_PATH, "image/jpeg");
        WeiboMediaReader reader = reader();

        ChannelMediaResult result = reader.read(weiboAccount(Map.of("accessToken", "wb-token-1")),
            "821804469");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.bytes()).isEqualTo(IMAGE_BYTES);
        assertThat(result.contentType()).isEqualTo("image/jpeg");
        assertThat(result.failureReason()).isNull();
        assertThat(requestLines.get(0)).startsWith("GET " + MEDIA_PATH + "?")
            .contains("access_token=wb-token-1")
            .contains("fid=821804469");
    }

    @Test
    void reportsChannelJsonErrorWithTheOriginalErrorCodeAndMessage() {
        // 官方页未给错误示例：msget 错误按微博开放平台通用 error_code/error 键如实透传
        handle(MEDIA_PATH, 200,
            "{\"request\": \"/2/mss/msget\", \"error_code\": \"30021\", \"error\": \"fid not found\"}");

        ChannelMediaResult result = reader().read(weiboAccount(Map.of("accessToken", "wb-token-1")),
            "821804469");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("30021").contains("fid not found");
    }

    @Test
    void reportsMissingCredentialsWithoutCallingTheEndpoint() {
        handle(MEDIA_PATH, 200, "{\"result\": true}");

        ChannelMediaResult result = reader().read(weiboAccount(Map.of()), "821804469");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).isEqualTo("渠道素材凭据未配置");
        assertThat(requestLines).isEmpty();
    }

    @Test
    void reportsTransportFailureInsteadOfPretendingSuccess() {
        // 替身未注册该路径（HTTP 404）：如实记录调用失败，不冒成功
        ChannelMediaResult result = reader().read(weiboAccount(Map.of("accessToken", "wb-token-1")),
            "821804469");
        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).isNotBlank();
    }

    private WeiboMediaReader reader() {
        return new WeiboMediaReader(RestClient.builder(), baseUrl);
    }

    private CompanyChannelDO weiboAccount(Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannel(ChannelEnum.WEIBO);
        account.setChannelInfo(channelInfo);
        return account;
    }

    // 二进制素材响应：带渠道内容类型返回字节
    private void handleBinary(String path, String contentType) {
        server.createContext(path, exchange -> {
            requestLines.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.sendResponseHeaders(200, IMAGE_BYTES.length);
            exchange.getResponseBody().write(IMAGE_BYTES);
            exchange.close();
        });
    }

    // JSON 错误响应
    private void handle(String path, int status, String response) {
        server.createContext(path, exchange -> {
            requestLines.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
            byte[] body = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(status, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
    }
}
