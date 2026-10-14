package com.dudu.duduserver.channel.wechatmini;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
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
 * 小程序纯文本主动回复验证：用本地 HTTP 替身按官方事实构造 access_token 与客服消息接口的
 * 成功/失败响应（docs/research/channels/wechat-mini.md §6.1、§6.2），验证换取凭据、下发
 * 报文与失败说明；不模拟成功、不掩盖渠道原始错误码。
 */
class WechatMiniTextSenderTest {

    // 官方返回示例原文形状：成功 {"access_token":"ACCESS_TOKEN","expires_in":7200}
    private static final String TOKEN_OK = "{\"access_token\":\"ACCESS_TOKEN\",\"expires_in\":7200}";
    // 客服消息接口成功响应为 errcode/errmsg，不返回消息标识
    private static final String SEND_OK = "{\"errcode\":0,\"errmsg\":\"ok\"}";

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
    void sendsCustomerServiceTextWithDocumentedTokenAndPayload() {
        handle("/cgi-bin/token", 200, TOKEN_OK);
        handle("/cgi-bin/message/custom/send", 200, SEND_OK);
        WechatMiniTextSender sender = sender();

        ChannelSendResult result = sender.send(wechatAccount(
                Map.of("appId", "wx_test_appid", "appSecret", "test-app-secret")),
            "o9AgO5Kd5ggOC-bXrbNODIiE3bGY", "你好，想咨询发货时间");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.externalMessageId()).isNull();
        assertThat(result.failureReason()).isNull();
        assertThat(requestLines.get(0))
            .startsWith("GET /cgi-bin/token?")
            .contains("grant_type=client_credential")
            .contains("appid=wx_test_appid")
            .contains("secret=test-app-secret");
        assertThat(requestLines.get(1)).startsWith("POST /cgi-bin/message/custom/send?")
            .contains("access_token=ACCESS_TOKEN");
        JSONObject payload = JSONUtil.parseObj(bodies.get(1));
        assertThat(payload.getStr("touser")).isEqualTo("o9AgO5Kd5ggOC-bXrbNODIiE3bGY");
        assertThat(payload.getStr("msgtype")).isEqualTo("text");
        assertThat(payload.getJSONObject("text").getStr("content")).isEqualTo("你好，想咨询发货时间");
    }

    @Test
    void reportsChannelRejectionWithTheOriginalErrorCodeAndMessage() {
        handle("/cgi-bin/token", 200, TOKEN_OK);
        handle("/cgi-bin/message/custom/send", 200,
            "{\"errcode\":40001,\"errmsg\":\"invalid credential, access_token is invalid or not latest rid: 65a3\"}");
        WechatMiniTextSender sender = sender();

        ChannelSendResult result = sender.send(wechatAccount(
            Map.of("appId", "wx_test_appid", "appSecret", "test-app-secret")), "openid-1", "在吗");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.externalMessageId()).isNull();
        assertThat(result.failureReason())
            .contains("40001")
            .contains("invalid credential, access_token is invalid or not latest");
    }

    @Test
    void reportsTokenFailureWithoutCallingTheSendEndpoint() {
        handle("/cgi-bin/token", 200,
            "{\"errcode\":40164,\"errmsg\":\"invalid ip 1.2.3.4, not in whitelist\"}");
        handle("/cgi-bin/message/custom/send", 200, SEND_OK);
        WechatMiniTextSender sender = sender();

        ChannelSendResult result = sender.send(wechatAccount(
            Map.of("appId", "wx_test_appid", "appSecret", "test-app-secret")), "openid-1", "在吗");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("40164").contains("not in whitelist");
        assertThat(requestLines).hasSize(1);
    }

    @Test
    void reportsTransportFailureInsteadOfPretendingSuccess() {
        // 替身未注册该路径（HTTP 404）：如实记录调用失败，不冒成功
        ChannelSendResult unbound = sender().send(wechatAccount(
                Map.of("appId", "wx_test_appid", "appSecret", "test-app-secret")),
            "openid-1", "在吗");
        assertThat(unbound.succeeded()).isFalse();
        assertThat(unbound.failureReason()).isNotBlank();

        // 非 JSON 响应（如网关返回 HTML）同样按失败处理
        handle("/cgi-bin/token", 200, "<html>bad gateway</html>");
        ChannelSendResult unreadable = sender().send(wechatAccount(
                Map.of("appId", "wx_test_appid", "appSecret", "test-app-secret")),
            "openid-1", "在吗");
        assertThat(unreadable.succeeded()).isFalse();
        assertThat(unreadable.failureReason()).isNotBlank();
    }

    private WechatMiniTextSender sender() {
        return new WechatMiniTextSender(RestClient.builder(), baseUrl);
    }

    private CompanyChannelDO wechatAccount(Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannel(ChannelEnum.WECHAT_MINI);
        account.setChannelInfo(channelInfo);
        return account;
    }

    // 本地替身：按路径记录请求行与请求体，返回构造好的官方形状响应
    private void handle(String path, int status, String response) {
        server.createContext(path, exchange -> {
            requestLines.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
            bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] body = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(status, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
    }
}
