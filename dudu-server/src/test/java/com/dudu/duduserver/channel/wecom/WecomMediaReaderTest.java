package com.dudu.duduserver.channel.wecom;

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
 * 企业微信素材读取实现验证：用本地 HTTP 替身按官方事实构造 access_token（91039）与获取
 * 临时素材（90254）的成功/失败响应（docs/research/channels/wecom.md §2 素材读取补证），
 * 验证换取凭据、按 media_id 读取字节与内容类型、失败说明如实透传渠道错误码；不模拟成功。
 */
class WecomMediaReaderTest {

    // 官方 91039 返回示例原文形状
    private static final String TOKEN_OK = "{\"errcode\":0,\"errmsg\":\"ok\","
        + "\"access_token\":\"accesstoken000001\",\"expires_in\":7200}";
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
    void readsBinaryMediaByChannelIdentifierWithDocumentedCredentials() {
        // 官方 90254：成功与普通 HTTP 下载相同，按响应头 Content-Type 处理
        handleJson("/cgi-bin/gettoken", 200, TOKEN_OK);
        handleBytes("/cgi-bin/media/get", 200, "image/jpeg", IMAGE_BYTES);

        ChannelMediaResult result = reader().read(account(), "MEDIA_ID");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.bytes()).isEqualTo(IMAGE_BYTES);
        assertThat(result.contentType()).isEqualTo("image/jpeg");
        assertThat(requestLines.get(0))
            .startsWith("GET /cgi-bin/gettoken?")
            .contains("corpid=ww_test_corp")
            .contains("corpsecret=test-corp-secret");
        assertThat(requestLines.get(1))
            .startsWith("GET /cgi-bin/media/get?")
            .contains("access_token=accesstoken000001")
            .contains("media_id=MEDIA_ID");
    }

    @Test
    void reportsChannelRejectionWithTheOriginalErrorCodeAndMessage() {
        // 官方 90254 错误返回：{"errcode":40007,"errmsg":"invalid media_id"}
        handleJson("/cgi-bin/gettoken", 200, TOKEN_OK);
        handleJson("/cgi-bin/media/get", 200, "{\"errcode\":40007,\"errmsg\":\"invalid media_id\"}");

        ChannelMediaResult result = reader().read(account(), "EXPIRED_ID");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("40007").contains("invalid media_id");
        assertThat(requestLines).hasSize(2);
    }

    @Test
    void reportsTokenFailureWithoutCallingTheMediaEndpoint() {
        handleJson("/cgi-bin/gettoken", 200,
            "{\"errcode\":60020,\"errmsg\":\"not allow to access from your ip\"}");
        handleBytes("/cgi-bin/media/get", 200, "image/jpeg", IMAGE_BYTES);

        ChannelMediaResult result = reader().read(account(), "MEDIA_ID");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("60020").contains("not allow to access from your ip");
        assertThat(requestLines).hasSize(1);
    }

    @Test
    void reportsTransportFailureInsteadOfPretendingSuccess() {
        // 替身未注册该路径（HTTP 404）：如实记录调用失败，不冒成功
        ChannelMediaResult unbound = reader().read(account(), "MEDIA_ID");
        assertThat(unbound.succeeded()).isFalse();
        assertThat(unbound.failureReason()).isNotBlank();

        // 接口返回无法识别的 JSON（无 errcode）同样按失败处理
        handleJson("/cgi-bin/gettoken", 200, TOKEN_OK);
        handleJson("/cgi-bin/media/get", 200, "{\"unexpected\":true}");
        ChannelMediaResult unreadable = reader().read(account(), "MEDIA_ID");
        assertThat(unreadable.succeeded()).isFalse();
        assertThat(unreadable.failureReason()).isNotBlank();
    }

    private WecomMediaReader reader() {
        return new WecomMediaReader(RestClient.builder(), baseUrl);
    }

    private CompanyChannelDO account() {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(9302L);
        account.setChannel(ChannelEnum.WECOM);
        account.setChannelInfo(Map.of("corpId", "ww_test_corp", "corpSecret", "test-corp-secret",
            "agentId", "1000002"));
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
