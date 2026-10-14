package com.dudu.duduserver.channel.feishu;

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
 * 飞书素材读取验收（官方 §5.13，docs/research/channels/feishu.md）：复合标识
 * 「message_id:file_key:type」解析后调 GET /open-apis/im/v1/messages/:message_id/
 * resources/:file_key?type=image|file，Bearer 凭据，二进制原样返回；渠道错误从
 * 响应体原样透出 code 与 msg，凭据缺失、标识无法识别与传输失败不冒成功。
 */
class FeishuMediaReaderTest {

    // 官方 §5.11 响应形状
    private static final String TOKEN_OK =
        "{\"code\":0,\"msg\":\"ok\",\"tenant_access_token\":\"t-caecc734c2e3328a62489fe0648c4b98779515d3\",\"expire\":7200}";

    private static final String MESSAGE_ID = "om_5ce6d572455d361153b7cb51da133945";
    private static final String FILE_KEY = "file_v2_47f38a2d1234567890";
    private static final byte[] IMAGE_BYTES = new byte[] {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};

    private final List<String> requestLines = new CopyOnWriteArrayList<>();
    private final List<String> authorizations = new CopyOnWriteArrayList<>();
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
    void readsCompositeMediaIdThroughTheDocumentedResourceEndpoint() {
        handleToken();
        server.createContext("/open-apis/im/v1/messages/" + MESSAGE_ID + "/resources/" + FILE_KEY, exchange -> {
            record(exchange);
            exchange.getResponseHeaders().set("Content-Type", "image/png");
            exchange.sendResponseHeaders(200, IMAGE_BYTES.length);
            exchange.getResponseBody().write(IMAGE_BYTES);
            exchange.close();
        });

        ChannelMediaResult result = reader().read(account(), MESSAGE_ID + ":" + FILE_KEY + ":image");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.bytes()).isEqualTo(IMAGE_BYTES);
        assertThat(result.contentType()).isEqualTo("image/png");
        assertThat(result.failureReason()).isNull();
        // 复合标识按文档拆分：type 作为查询参数，resource 端点路径逐段对上
        assertThat(requestLines.get(1))
            .isEqualTo("GET /open-apis/im/v1/messages/" + MESSAGE_ID + "/resources/" + FILE_KEY + "?type=image");
        assertThat(authorizations.get(1)).isEqualTo("Bearer t-caecc734c2e3328a62489fe0648c4b98779515d3");
    }

    @Test
    void defaultsMissingContentTypeToOctetStream() {
        handleToken();
        handle("/open-apis/im/v1/messages/" + MESSAGE_ID + "/resources/" + FILE_KEY, 200,
            IMAGE_BYTES, null);

        ChannelMediaResult result = reader().read(account(), MESSAGE_ID + ":" + FILE_KEY + ":file");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.contentType()).isEqualTo("application/octet-stream");
    }

    @Test
    void reportsChannelRejectionFromTheErrorBody() {
        handleToken();
        // 官方 §5.13 错误形状：无媒体权限
        handle("/open-apis/im/v1/messages/" + MESSAGE_ID + "/resources/" + FILE_KEY, 403,
            "{\"code\":230110,\"msg\":\"has no media permission\"}".getBytes(StandardCharsets.UTF_8),
            "application/json; charset=utf-8");

        ChannelMediaResult result = reader().read(account(), MESSAGE_ID + ":" + FILE_KEY + ":image");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).startsWith("飞书素材读取失败：")
            .contains("230110").contains("has no media permission");
    }

    @Test
    void reportsTokenFailureWithoutCallingTheMediaEndpoint() {
        handle("/open-apis/auth/v3/tenant_access_token/internal", 200,
            "{\"code\":99991663,\"msg\":\"app id is not found\"}".getBytes(StandardCharsets.UTF_8),
            "application/json; charset=utf-8");
        handle("/open-apis/im/v1/messages/" + MESSAGE_ID + "/resources/" + FILE_KEY, 200,
            IMAGE_BYTES, "image/png");

        ChannelMediaResult result = reader().read(account(), MESSAGE_ID + ":" + FILE_KEY + ":image");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("99991663");
        assertThat(requestLines).hasSize(1);
    }

    @Test
    void rejectsUnrecognizableMediaIdWithoutCallingAnyEndpoint() {
        ChannelMediaResult noSplit = reader().read(account(), MESSAGE_ID);
        ChannelMediaResult missingType = reader().read(account(), MESSAGE_ID + ":" + FILE_KEY);

        assertThat(noSplit.succeeded()).isFalse();
        assertThat(missingType.succeeded()).isFalse();
        assertThat(noSplit.failureReason()).isEqualTo("飞书素材读取失败：素材标识无法识别");
        assertThat(requestLines).isEmpty();
    }

    @Test
    void reportsTransportFailureInsteadOfPretendingSuccess() {
        handleToken();
        // 替身未注册素材路径（HTTP 404）：如实记录调用失败，不冒成功
        ChannelMediaResult result = reader().read(account(), MESSAGE_ID + ":" + FILE_KEY + ":image");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).isNotBlank();
    }

    // ---- 夹具 ----

    private FeishuMediaReader reader() {
        return new FeishuMediaReader(RestClient.builder(), baseUrl);
    }

    private CompanyChannelDO account() {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannel(ChannelEnum.FEISHU);
        account.setChannelInfo(Map.of(
            "appId", "cli_9f5343c580712544",
            "appSecret", "dskLLdkasdjlasdKK",
            "verificationToken", "rvaYgkND1GOiu5MM0E1rncYC6PLtF7JV"));
        return account;
    }

    private void handleToken() {
        handle("/open-apis/auth/v3/tenant_access_token/internal", 200,
            TOKEN_OK.getBytes(StandardCharsets.UTF_8), "application/json; charset=utf-8");
    }

    private void handle(String path, int status, byte[] body, String contentType) {
        server.createContext(path, exchange -> {
            record(exchange);
            if (contentType != null) {
                exchange.getResponseHeaders().set("Content-Type", contentType);
            }
            exchange.sendResponseHeaders(status, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
    }

    private void record(com.sun.net.httpserver.HttpExchange exchange) {
        requestLines.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
        authorizations.add(String.valueOf(exchange.getRequestHeaders().getFirst("Authorization")));
    }
}
