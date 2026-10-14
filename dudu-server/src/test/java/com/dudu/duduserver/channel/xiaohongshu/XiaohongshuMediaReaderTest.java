package com.dudu.duduserver.channel.xiaohongshu;

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
 * 小红书素材读取验证（事实见 docs/research/channels/xiaohongshu.md §10.3、§12.4）：小红书
 * 不提供按 media_id 拉取素材的接口，推送中的 image/video 素材只有 PicUrl/VideoUrl 公开链接，
 * 消息中已保存的渠道引用即该链接——读取=下载该链接字节；回调凭据不齐的账号在读取前被拒，
 * 下载失败与非法引用都如实返回失败说明，不模拟成功。
 */
class XiaohongshuMediaReaderTest {

    private static final byte[] IMAGE_BYTES = "fake-jpeg-bytes".getBytes(StandardCharsets.UTF_8);

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
    void downloadsTheSavedChannelReferenceBytesWithChannelContentType() {
        handleBytes("/sns/img.jpg", 200, "image/jpeg", IMAGE_BYTES);
        XiaohongshuMediaReader reader = reader();

        ChannelMediaResult result = reader.read(
            configuredAccount(), baseUrl + "/sns/img.jpg");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.bytes()).isEqualTo(IMAGE_BYTES);
        assertThat(result.contentType()).isEqualTo("image/jpeg");
        assertThat(result.failureReason()).isNull();
        assertThat(requestLines.get(0)).startsWith("GET /sns/img.jpg");
    }

    @Test
    void reportsDownloadAndIllegalReferenceFailuresHonestly() {
        XiaohongshuMediaReader reader = reader();

        // 替身未注册该路径（HTTP 404）：如实记录下载失败，不冒成功
        ChannelMediaResult unbound = reader.read(configuredAccount(), baseUrl + "/sns/gone.jpg");
        assertThat(unbound.succeeded()).isFalse();
        assertThat(unbound.bytes()).isNull();
        assertThat(unbound.failureReason()).isNotBlank();

        // 解析消息只拿到派生标识（无链接落库的历史消息）：无地址可取，按失败处理
        ChannelMediaResult derivedId = reader.read(configuredAccount(), "MSG_ID:0");
        assertThat(derivedId.succeeded()).isFalse();
        assertThat(derivedId.failureReason()).isNotBlank();
    }

    @Test
    void refusesAccountsMissingCallbackCredentialsBeforeAnyNetworkCall() {
        XiaohongshuMediaReader reader = reader();

        ChannelMediaResult result = reader.read(
            account(Map.of("url", "https://desk.example/callback")), baseUrl + "/sns/img.jpg");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("素材凭据未配置");
        assertThat(requestLines).isEmpty();
    }

    private XiaohongshuMediaReader reader() {
        return new XiaohongshuMediaReader(RestClient.builder());
    }

    private CompanyChannelDO configuredAccount() {
        return account(Map.of(
            "token", "xhs-callback-token",
            "encodingAesKey", "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C",
            "appId", "wx5823bf96d3bd56c7"));
    }

    private CompanyChannelDO account(Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannel(ChannelEnum.XIAOHONGSHU);
        account.setChannelInfo(channelInfo);
        return account;
    }

    // 本地替身：按路径记录请求行，返回构造好的字节响应
    private void handleBytes(String path, int status, String contentType, byte[] response) {
        server.createContext(path, exchange -> {
            requestLines.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.sendResponseHeaders(status, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
    }
}
