package com.dudu.duduserver.channel.xiaohongshu;

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
 * 小红书纯文本主动回复验证：用本地 HTTP 替身按官方事实构造调用凭证与发送客服消息接口的
 * 成功/失败响应（docs/research/channels/xiaohongshu.md §12.1、§12.2），验证 POST JSON 换取
 * access_token、公共参数与业务报文分置（公共参数按微信族惯例走 query，官方位置未明示待
 * 真实凭据联调）、成功以 success=true 且 code=0 为准、失败原样透传渠道说明；不模拟成功、
 * 不掩盖渠道原始错误码。
 */
class XiaohongshuTextSenderTest {

    // DC010382 返回示例原文形状
    private static final String TOKEN_OK =
        "{\"data\":{\"access_token\":\"ACCESS_TOKEN\",\"expire_in\":7200},\"success\":true,\"msg\":\"success\",\"code\":0}";
    // DC234367 返回示例原文形状：不返回消息标识
    private static final String SEND_OK = "{\"success\":true,\"msg\":\"success\",\"code\":0}";

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
    void exchangesTokenWithJsonBodyThenSendsDocumentedCustomMessagePayload() {
        handle("/api/rmp/token", 200, TOKEN_OK);
        handle("/api/rmp/message/custom", 200, SEND_OK);
        XiaohongshuTextSender sender = sender();

        ChannelSendResult result = sender.send(xiaohongshuAccount(
                Map.of("appId", "wx5823bf96d3bd56c7", "appSecret", "test-app-secret")),
            "USER_OPEN_ID", "你好，这款有货");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.externalMessageId()).isNull();
        assertThat(result.failureReason()).isNull();

        // DC010382：POST /api/rmp/token，body 以 JSON 写入 appid/secret
        assertThat(requestLines.get(0)).startsWith("POST /api/rmp/token");
        JSONObject tokenPayload = JSONUtil.parseObj(bodies.get(0));
        assertThat(tokenPayload.getStr("appid")).isEqualTo("wx5823bf96d3bd56c7");
        assertThat(tokenPayload.getStr("secret")).isEqualTo("test-app-secret");

        // DC234367：业务参数在 body；公共参数按微信族惯例走 query
        assertThat(requestLines.get(1)).startsWith("POST /api/rmp/message/custom?")
            .contains("app_id=wx5823bf96d3bd56c7")
            .contains("access_token=ACCESS_TOKEN");
        JSONObject sendPayload = JSONUtil.parseObj(bodies.get(1));
        assertThat(sendPayload.getStr("openid")).isEqualTo("USER_OPEN_ID");
        assertThat(sendPayload.getStr("msg_type")).isEqualTo("text");
        assertThat(sendPayload.getStr("content")).isEqualTo("你好，这款有货");
    }

    @Test
    void reportsChannelRejectionWithTheOriginalCodeAndMessage() {
        handle("/api/rmp/token", 200, TOKEN_OK);
        handle("/api/rmp/message/custom", 200,
            "{\"success\":false,\"msg\":\"invalid access_token\",\"code\":40001}");
        XiaohongshuTextSender sender = sender();

        ChannelSendResult result = sender.send(xiaohongshuAccount(
                Map.of("appId", "wx5823bf96d3bd56c7", "appSecret", "test-app-secret")),
            "USER_OPEN_ID", "在吗");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.externalMessageId()).isNull();
        assertThat(result.failureReason()).contains("40001").contains("invalid access_token");
    }

    @Test
    void reportsTokenFailureWithoutCallingTheSendEndpoint() {
        handle("/api/rmp/token", 200,
            "{\"data\":{},\"success\":false,\"msg\":\"appsecret 错误\",\"code\":40002}");
        handle("/api/rmp/message/custom", 200, SEND_OK);
        XiaohongshuTextSender sender = sender();

        ChannelSendResult result = sender.send(xiaohongshuAccount(
                Map.of("appId", "wx5823bf96d3bd56c7", "appSecret", "test-app-secret")),
            "USER_OPEN_ID", "在吗");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("40002").contains("appsecret 错误");
        assertThat(requestLines).hasSize(1);
    }

    @Test
    void treatsNonZeroCodeInSuccessMarkedResponseAsFailure() {
        // 文档口径：正确响应须 success=true 且 code=0；标记为成功但 code 非 0 仍按失败
        handle("/api/rmp/token", 200, TOKEN_OK);
        handle("/api/rmp/message/custom", 200, "{\"success\":true,\"msg\":\"\",\"code\":40003}");
        ChannelSendResult half = sender().send(xiaohongshuAccount(
                Map.of("appId", "wx5823bf96d3bd56c7", "appSecret", "test-app-secret")),
            "USER_OPEN_ID", "在吗");
        assertThat(half.succeeded()).isFalse();
        assertThat(half.failureReason()).contains("40003");
    }

    @Test
    void reportsTransportFailureInsteadOfPretendingSuccess() {
        // 替身未注册该路径（HTTP 404）：如实记录调用失败，不冒成功
        ChannelSendResult unbound = sender().send(xiaohongshuAccount(
                Map.of("appId", "wx5823bf96d3bd56c7", "appSecret", "test-app-secret")),
            "USER_OPEN_ID", "在吗");
        assertThat(unbound.succeeded()).isFalse();
        assertThat(unbound.failureReason()).isNotBlank();

        // 非 JSON 响应（如网关返回 HTML）同样按失败处理
        handle("/api/rmp/token", 200, "<html>bad gateway</html>");
        ChannelSendResult unreadable = sender().send(xiaohongshuAccount(
                Map.of("appId", "wx5823bf96d3bd56c7", "appSecret", "test-app-secret")),
            "USER_OPEN_ID", "在吗");
        assertThat(unreadable.succeeded()).isFalse();
        assertThat(unreadable.failureReason()).isNotBlank();
    }

    private XiaohongshuTextSender sender() {
        return new XiaohongshuTextSender(RestClient.builder(), baseUrl);
    }

    private CompanyChannelDO xiaohongshuAccount(Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannel(ChannelEnum.XIAOHONGSHU);
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
