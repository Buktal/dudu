package com.dudu.duduserver.channel.douyin;

import com.dudu.duduserver.channel.ChannelMediaResult;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 抖音本地媒体资源读取验收（事实见 docs/research/channels/douyin.md §8.4 官方
 * ReqExample 逐字）：四段复合标识经 GetIMMessageResource 换 30 天有效 URL 再取字节——
 * query 三参含 + = @ / 特殊字符必须 URL 编码，Header access-token 走 refreshToken 续期
 * 链路；响应按 err_no/err_msg/log_id 信封判失败（非 dop extra 信封）；url 中的字面
 * 转义序列需替换为 & 后访问，二跳须携带与调用接口相同的 Access-Token/OpenID 头。
 */
class DouyinMediaResourceClientTest {

    // §6 刷新链路成功样例（与 DouyinTokenClientTest 同源黄金常量）
    private static final String REFRESH_OK =
        "{\"data\":{\"access_token\":\"act.b5efd5ad64f0cfea3df3ff57e4efd2KnC0VisBaEXFnQRo\","
            + "\"expires_in\":1296000},\"message\":\"success\",\"code\":0}";

    // §8.4 ReqExample 的三要素逐字（message_id/conversation_id 含 + = / @ 特殊字符）
    private static final DouyinProtocol.MediaResource RESOURCE = new DouyinProtocol.MediaResource(
        "@9VwDhOCRTcMhM22uc8ptWc791m3uPvyEPZV5rgOlKFAVbPT860zdRmYqig357zEB4Kil85ESSP+5XoOMbKfd5w==",
        "@9VwDhOCRTcMhM22uc8ptWc791WbvOP+HMpxwrAOiL1MWa/H460zdRmYqig357zEBdsmeO0WyFq81ZGOrbYMEaw==",
        "2d3201d1-4cf2-4f01-8368-b6f2fb047d", "0");

    // 官方口径：url 可能含字面「反斜杠+u0026」转义序列；JSON 文本层需双反斜杠，解析后
    // url 值才是待替换的单反斜杠序列（拆开书写避免 Java unicode 预处理先行吞掉）
    private static final String JSON_ESCAPED_AMP = "\\\\" + "u0026";

    private final List<String> requestLines = new CopyOnWriteArrayList<>();
    private final Map<String, String> downloadHeaders = new HashMap<>();
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
    void fetchesResourceUrlAndDownloadsBytesWithAuthHeaders() {
        // url 携带字面转义序列：客户端须替换为 & 后访问（替换失效则请求 URI 仍带原序列）
        handle("/api/im/message/resources/", 200, "{\"err_no\":0,\"err_msg\":\"success\","
            + "\"log_id\":\"202011181642120101310370900E0E0E0\","
            + "\"data\":{\"media_type\":1,\"url\":\"" + baseUrl + "/im_open/media?type=image"
            + JSON_ESCAPED_AMP + "secret=skv2Z1fhiKw1gGBs%3D\"}}");
        handleBytes("/im_open/media");
        handle("/oauth/refresh_token/", 200, REFRESH_OK);

        ChannelMediaResult result = client().read(account("rft.1d1021d2aee3d41fee2d2ad"), RESOURCE);

        assertThat(result.succeeded()).isTrue();
        assertThat(result.contentType()).isEqualTo("image/jpeg");
        assertThat(result.bytes()).isEqualTo(new byte[] {(byte) 0xFF, (byte) 0xD8, 0x33, 0x44});

        // 资源接口 query（第 1 条请求，第 0 条为 refreshToken 续期）：三参按官方样例
        // URL 编码（%40 @、%2B +、%3D =、%2F /）后可解码还原
        String query = requestLines.get(1).split("\\?")[1];
        assertThat(query).contains("%40").contains("%2B").contains("%3D");
        assertThat(decoded(query, "conversation_id")).isEqualTo(RESOURCE.conversationId());
        assertThat(decoded(query, "message_id")).isEqualTo(RESOURCE.serverMessageId());
        assertThat(decoded(query, "open_id")).isEqualTo(RESOURCE.ownerOpenId());

        // 二跳访问（第 2 条）：转义序列已替换为 &，且携带与接口调用相同的 Access-Token/OpenID 头
        assertThat(requestLines.get(2)).endsWith("/im_open/media?type=image&secret=skv2Z1fhiKw1gGBs%3D");
        assertThat(downloadHeaders.get("Access-Token"))
            .isEqualTo("act.b5efd5ad64f0cfea3df3ff57e4efd2KnC0VisBaEXFnQRo");
        assertThat(downloadHeaders.get("OpenID")).isEqualTo(RESOURCE.ownerOpenId());
    }

    @Test
    void reportsChannelErrorEnvelopeWithOriginalErrorAndLogId() {
        // §8.4 错误码样例：28029006 权限校验失败（HTTP 恒 200，err_no 信封判失败）
        handle("/api/im/message/resources/", 200,
            "{\"err_no\":28029006,\"err_msg\":\"permission check fail\",\"log_id\":\"log-9\"}");
        handle("/oauth/refresh_token/", 200, REFRESH_OK);

        ChannelMediaResult result = client().read(account("rft.1d1021d2aee3d41fee2d2ad"), RESOURCE);

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("28029006").contains("permission check fail")
            .contains("log_id=log-9");
        // 失败不再发起二跳下载
        assertThat(requestLines).hasSize(2);
    }

    @Test
    void reportsMissingUrlInDataAsFailure() {
        handle("/api/im/message/resources/", 200, "{\"err_no\":0,\"err_msg\":\"success\"}");
        handle("/oauth/refresh_token/", 200, REFRESH_OK);

        ChannelMediaResult result = client().read(account("rft.1d1021d2aee3d41fee2d2ad"), RESOURCE);

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("缺少资源 url");
    }

    @Test
    void reportsTokenGapWithoutCallingResourceEndpoint() {
        // 未完成用户授权（缺 refreshToken）：接口凭据缺口原样带回，不出网调资源接口
        ChannelMediaResult result = client().read(account(null), RESOURCE);

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("用户授权").contains("refreshToken");
        assertThat(requestLines).isEmpty();
    }

    // ---- 夹具 ----

    private DouyinMediaResourceClient client() {
        return new DouyinMediaResourceClient(RestClient.builder(), baseUrl);
    }

    private com.dudu.duduserver.entity.CompanyChannelDO account(String refreshToken) {
        com.dudu.duduserver.entity.CompanyChannelDO account = new com.dudu.duduserver.entity.CompanyChannelDO();
        account.setCompanyChannelId(9202L);
        account.setChannel(com.dudu.duduserver.constant.ChannelEnum.DOUYIN);
        Map<String, Object> info = new HashMap<>();
        info.put("clientKey", "asdfavetgbvasf");
        info.put("clientSecret", "9e096e3a2a8b4e0f9c0f");
        if (refreshToken != null) {
            info.put("refreshToken", refreshToken);
        }
        account.setChannelInfo(info);
        return account;
    }

    private String decoded(String query, String key) {
        for (String pair : query.split("&")) {
            String[] entry = pair.split("=", 2);
            if (key.equals(URLDecoder.decode(entry[0], StandardCharsets.UTF_8))) {
                return URLDecoder.decode(entry[1], StandardCharsets.UTF_8);
            }
        }
        return null;
    }

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

    // 二跳字节替身：记录鉴权头并返回 JPEG 内容类型与样例字节
    private void handleBytes(String path) {
        server.createContext(path, exchange -> {
            requestLines.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
            downloadHeaders.put("Access-Token", exchange.getRequestHeaders().getFirst("Access-Token"));
            downloadHeaders.put("OpenID", exchange.getRequestHeaders().getFirst("OpenID"));
            byte[] body = new byte[] {(byte) 0xFF, (byte) 0xD8, 0x33, 0x44};
            exchange.getResponseHeaders().set("Content-Type", "image/jpeg");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
    }
}
