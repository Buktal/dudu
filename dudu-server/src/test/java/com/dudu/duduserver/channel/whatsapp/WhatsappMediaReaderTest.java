package com.dudu.duduserver.channel.whatsapp;

import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.sun.net.httpserver.HttpExchange;
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
 * WhatsApp 入站素材读取实现验证（事实见 docs/research/channels/whatsapp.md §5.6）：
 * 本地替身按官方两步流程应答——GET /{version}/{media_id}（Bearer）返回
 * {messaging_product,url,mime_type,sha256,file_size,id}，再对 url 带 Bearer 头取二进制；
 * 验证两步鉴权、内容类型回退与失败说明，不模拟成功。
 */
class WhatsappMediaReaderTest {

    private static final byte[] IMAGE_BYTES = "whatsapp-media-bytes".getBytes(StandardCharsets.UTF_8);
    // 官方第一步响应形状（§5.6 六字段）
    private static final String MEDIA_META = "{\"messaging_product\":\"whatsapp\","
        + "\"url\":\"%s\",\"mime_type\":\"image/jpeg\",\"sha256\":\"SfI=\",\"file_size\":\"20\","
        + "\"id\":\"1003383421387256\"}";
    // 官方拒绝形状：媒体 id 失效（webhook 内 7 天后）等场景
    private static final String MEDIA_ERROR = "{\"error\":{\"message\":\"Unsupported get request.\","
        + "\"type\":\"GraphMethodException\",\"code\":100,\"error_data\":{\"messaging_product\":\"whatsapp\","
        + "\"details\":\"Media expired or not available\"}}}";

    private final List<String> metaRequests = new CopyOnWriteArrayList<>();
    private final List<String> metaAuth = new CopyOnWriteArrayList<>();
    private final List<String> downloadRequests = new CopyOnWriteArrayList<>();
    private final List<String> downloadAuth = new CopyOnWriteArrayList<>();
    private HttpServer server;
    private String baseUrl;
    private volatile int metaStatus = 200;
    private volatile String metaBody = MEDIA_META.formatted("PLACEHOLDER");
    private volatile int downloadStatus = 200;
    private volatile String downloadContentType = "image/jpeg";

    @BeforeEach
    void startServer() throws IOException {
        metaRequests.clear();
        metaAuth.clear();
        downloadRequests.clear();
        downloadAuth.clear();
        metaStatus = 200;
        downloadStatus = 200;
        downloadContentType = "image/jpeg";
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        // 官方 §5.6 第一步：GET /{version}/{media_id}
        server.createContext("/v23.0/1003383421387256", exchange -> {
            metaRequests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
            metaAuth.add(exchange.getRequestHeaders().getFirst("Authorization"));
            respond(exchange, metaStatus, metaBody.formatted(downloadUrl()));
        });
        // 官方 §5.6 第二步：对 url 再 GET（仍要 Bearer），返回媒体二进制
        server.createContext("/whatsapp_business/attachments/", exchange -> {
            downloadRequests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
            downloadAuth.add(exchange.getRequestHeaders().getFirst("Authorization"));
            byte[] bytes = IMAGE_BYTES;
            if (downloadContentType == null) {
                exchange.sendResponseHeaders(downloadStatus, bytes.length);
            } else {
                exchange.getResponseHeaders().set("Content-Type", downloadContentType);
                exchange.sendResponseHeaders(downloadStatus, bytes.length);
            }
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
        metaBody = MEDIA_META.formatted(downloadUrl());
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void readDownloadsBytesThroughTwoAuthenticatedSteps() {
        ChannelMediaResult result = reader().read(account(), "1003383421387256");
        assertThat(result.succeeded()).isTrue();
        assertThat(result.bytes()).isEqualTo(IMAGE_BYTES);
        // 二进制响应头优先作内容类型
        assertThat(result.contentType()).isEqualTo("image/jpeg");
        // 两步都带 Bearer（官方："If you omit your token, the request will fail."）
        assertThat(metaRequests).containsExactly("GET /v23.0/1003383421387256");
        assertThat(metaAuth).containsExactly("Bearer SYSTEM_USER_TOKEN");
        assertThat(downloadRequests).containsExactly("GET /whatsapp_business/attachments/?mid=1003383421387256");
        assertThat(downloadAuth).containsExactly("Bearer SYSTEM_USER_TOKEN");
    }

    @Test
    void readFallsBackToMetaMimeTypeWhenDownloadOmitsContentType() {
        downloadContentType = null;
        ChannelMediaResult result = reader().read(account(), "1003383421387256");
        assertThat(result.succeeded()).isTrue();
        // 回退第一步 meta 的 mime_type
        assertThat(result.contentType()).isEqualTo("image/jpeg");
    }

    @Test
    void readSurfacesChannelErrorWhenMediaIdUnresolvable() {
        metaStatus = 404;
        metaBody = MEDIA_ERROR;
        ChannelMediaResult result = reader().read(account(), "1003383421387256");
        assertThat(result.succeeded()).isFalse();
        assertThat(result.bytes()).isNull();
        // 渠道原始 error 原样透出：code + message + error_data.details
        assertThat(result.failureReason())
            .isEqualTo("WhatsApp素材读取失败：100 Unsupported get request. Media expired or not available");
    }

    @Test
    void readFailsHonestlyWhenMetaHasNoUrlOrDownloadExpires() {
        // 第一步响应缺 url：没有可下载地址（id 失效场景）
        metaBody = "{\"messaging_product\":\"whatsapp\",\"mime_type\":\"image/jpeg\",\"id\":\"1003383421387256\"}";
        ChannelMediaResult noUrl = reader().read(account(), "1003383421387256");
        assertThat(noUrl.succeeded()).isFalse();
        assertThat(noUrl.failureReason()).isEqualTo("WhatsApp素材读取失败：响应缺少 url");

        // 第二步 404：url 5 分钟过期场景（lookaside 直链失效为纯文本响应）
        metaBody = MEDIA_META.formatted(downloadUrl());
        downloadStatus = 404;
        downloadContentType = "text/plain";
        ChannelMediaResult expired = reader().read(account(), "1003383421387256");
        assertThat(expired.succeeded()).isFalse();
        assertThat(expired.failureReason()).startsWith("WhatsApp素材读取失败：HTTP 404");
    }

    private WhatsappMediaReader reader() {
        return new WhatsappMediaReader(RestClient.builder(), baseUrl);
    }

    private String downloadUrl() {
        return baseUrl + "/whatsapp_business/attachments/?mid=1003383421387256";
    }

    private CompanyChannelDO account() {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(11204L);
        account.setChannelInfo(Map.of(
            "url", "https://dudu.example.com/api/channels/1/callback",
            "appSecret", "whatsapp_app_secret",
            "verifyToken", "meaty-hammer-7",
            "accessToken", "SYSTEM_USER_TOKEN",
            "phoneNumberId", "106540352242922"));
        return account;
    }

    private void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
