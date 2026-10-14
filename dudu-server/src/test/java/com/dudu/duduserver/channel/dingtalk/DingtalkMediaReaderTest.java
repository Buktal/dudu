package com.dudu.duduserver.channel.dingtalk;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
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
 * 钉钉媒体读取验收（事实库 §5.11 换链 API 直抓）：本地替身按官方事实构造新版凭证、
 * downloadCode 换临时链接（POST /v1.0/robot/messageFiles/download，header
 * x-acs-dingtalk-access-token，body robotCode/downloadCode）与字节下载的成功/失败
 * 响应；渠道错误透传原始 code/message，失败不冒成功。
 */
class DingtalkMediaReaderTest {

    private static final String TOKEN_OK = "{\"accessToken\":\"ACCESS_TOKEN\",\"expireIn\":7200}";
    private static final byte[] FILE_BYTES = "dingtalk-media-bytes".getBytes(StandardCharsets.UTF_8);

    private final List<String> requestLines = new CopyOnWriteArrayList<>();
    private final List<String> bodies = new CopyOnWriteArrayList<>();
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
    void exchangesDownloadCodeAndReturnsBytes() {
        handle("/v1.0/oauth2/accessToken", 200, TOKEN_OK);
        // 官方换链响应形状：{downloadUrl, fieldName}；downloadUrl 为临时完整地址
        handle("/v1.0/robot/messageFiles/download", 200,
            "{\"downloadUrl\":\"" + baseUrl + "/robot-file\",\"fieldName\":\"image\"}");
        handle("/robot-file", 200, new String(FILE_BYTES, StandardCharsets.UTF_8));

        ChannelMediaResult result = reader().read(dingtalkAccount(), "mIofN681YE3f/…");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.bytes()).isEqualTo(FILE_BYTES);
        // 渠道给出的内容类型如实透传，不猜具体格式
        assertThat(result.contentType()).isEqualTo("application/json;charset=utf-8");
        // 换链请求：header 凭证 + body robotCode（取 appKey）与 downloadCode
        assertThat(requestLines.get(1)).startsWith("POST /v1.0/robot/messageFiles/download");
        assertThat(bodies.get(0)).contains("appKey");
        JSONObject exchange = JSONUtil.parseObj(bodies.get(1));
        assertThat(exchange.getStr("robotCode")).isEqualTo("dingeqqpkv3xxxxxx");
        assertThat(exchange.getStr("downloadCode")).isEqualTo("mIofN681YE3f/…");
    }

    @Test
    void reportsChannelRejectionWithTheOriginalCodeAndMessage() {
        handle("/v1.0/oauth2/accessToken", 200, TOKEN_OK);
        handle("/v1.0/robot/messageFiles/download", 200,
            "{\"code\":\"ForbiddenAccess\",\"message\":\"此 downloadCode 和机器人 robotCode 不匹配\"}");

        ChannelMediaResult result = reader().read(dingtalkAccount(), "mIofN…");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("ForbiddenAccess").contains("此 downloadCode 和机器人 robotCode 不匹配");
    }

    @Test
    void reportsDownloadLinkFailureInsteadOfPretendingBytes() {
        handle("/v1.0/oauth2/accessToken", 200, TOKEN_OK);
        handle("/v1.0/robot/messageFiles/download", 200,
            "{\"downloadUrl\":\"" + baseUrl + "/expired\",\"fieldName\":\"image\"}");
        // 临时链接已失效：下载 404 如实失败
        handleStatus("/expired", 404);

        ChannelMediaResult result = reader().read(dingtalkAccount(), "mIofN…");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).isNotBlank();
    }

    @Test
    void reportsTokenFailureWithoutCallingTheExchange() {
        handle("/v1.0/oauth2/accessToken", 200,
            "{\"code\":\"InvalidAuthentication\",\"message\":\"appSecret 不正确\"}");
        handle("/v1.0/robot/messageFiles/download", 200, "{\"downloadUrl\":\"" + baseUrl + "/robot-file\"}");

        ChannelMediaResult result = reader().read(dingtalkAccount(), "mIofN…");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("InvalidAuthentication");
        assertThat(requestLines).hasSize(1);
    }

    private DingtalkMediaReader reader() {
        return new DingtalkMediaReader(RestClient.builder(), baseUrl);
    }

    private CompanyChannelDO dingtalkAccount() {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannel(ChannelEnum.DINGTALK);
        account.setChannelInfo(Map.of("appKey", "dingeqqpkv3xxxxxx", "appSecret", "GT-lsu-taDAxxx",
            "agentId", "123456789"));
        return account;
    }

    // 本地替身：按路径记录请求行与请求体，返回构造好的官方形状响应
    private void handle(String path, int status, String response) {
        server.createContext(path, exchange -> {
            requestLines.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
            bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            respond(exchange, status, response.getBytes(StandardCharsets.UTF_8));
        });
    }

    private void handleStatus(String path, int status) {
        server.createContext(path, exchange -> {
            requestLines.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
            respond(exchange, status, new byte[0]);
        });
    }

    private void respond(com.sun.net.httpserver.HttpExchange exchange, int status, byte[] body) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, body.length == 0 ? -1 : body.length);
        if (body.length > 0) {
            exchange.getResponseBody().write(body);
        }
        exchange.close();
    }
}
