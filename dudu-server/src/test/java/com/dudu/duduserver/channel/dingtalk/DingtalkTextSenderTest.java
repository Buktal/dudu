package com.dudu.duduserver.channel.dingtalk;

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
 * 钉钉工作通知文本发送验收（事实库 §5.9/§5.11 全文直抓）：本地替身按官方事实构造
 * 新版 accessToken 与 asyncsend_v2 的成功/失败响应，验证换凭据、下发报文、task_id
 * 回传、原始 errcode 透传、失败不冒成功与 7200s 凭证进程内缓存复用。
 */
class DingtalkTextSenderTest {

    // 官方返回示例原文形状：新版凭证 {"accessToken":"...","expireIn":7200}
    private static final String TOKEN_OK = "{\"accessToken\":\"ACCESS_TOKEN\",\"expireIn\":7200}";
    // 工作通知成功响应官方示例：errcode=0 + task_id + request_id
    private static final String SEND_OK =
        "{\"errcode\":0,\"errmsg\":\"ok\",\"task_id\":256271667526,\"request_id\":\"4jzllmte0wau\"}";

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
    void sendsWorkNotificationWithDocumentedTokenAndPayload() {
        handle("/v1.0/oauth2/accessToken", 200, TOKEN_OK);
        handle("/topapi/message/corpconversation/asyncsend_v2", 200, SEND_OK);

        ChannelSendResult result = sender().send(dingtalkAccount(), "014728255240768602", "你好，想咨询发货时间");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.externalMessageId()).isEqualTo("256271667526");
        assertThat(result.failureReason()).isNull();
        // 新版凭证：POST /v1.0/oauth2/accessToken，body appKey/appSecret
        assertThat(requestLines.get(0)).startsWith("POST /v1.0/oauth2/accessToken");
        JSONObject tokenBody = JSONUtil.parseObj(bodies.get(0));
        assertThat(tokenBody.getStr("appKey")).isEqualTo("dingeqqpkv3xxxxxx");
        assertThat(tokenBody.getStr("appSecret")).isEqualTo("GT-lsu-taDAxxx");
        // 工作通知：oapi 系 query access_token，body agent_id/userid_list/msg
        assertThat(requestLines.get(1)).startsWith("POST /topapi/message/corpconversation/asyncsend_v2?")
            .contains("access_token=ACCESS_TOKEN");
        JSONObject payload = JSONUtil.parseObj(bodies.get(1));
        assertThat(payload.getStr("agent_id")).isEqualTo("123456789");
        assertThat(payload.getStr("userid_list")).isEqualTo("014728255240768602");
        assertThat(payload.getJSONObject("msg").getStr("msgtype")).isEqualTo("text");
        assertThat(payload.getJSONObject("msg").getJSONObject("text").getStr("content"))
            .isEqualTo("你好，想咨询发货时间");
    }

    @Test
    void reportsChannelRejectionWithTheOriginalErrcodeAndMessage() {
        handle("/v1.0/oauth2/accessToken", 200, TOKEN_OK);
        handle("/topapi/message/corpconversation/asyncsend_v2", 200,
            "{\"errcode\":88,\"errmsg\":\"工作通知的接收人个数超过100\"}");

        ChannelSendResult result = sender().send(dingtalkAccount(), "staff-1", "在吗");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.externalMessageId()).isNull();
        assertThat(result.failureReason()).contains("88").contains("工作通知的接收人个数超过100");
    }

    @Test
    void reportsTokenFailureWithoutCallingTheSendEndpoint() {
        // 新 api 系错误形状：code/message
        handle("/v1.0/oauth2/accessToken", 200,
            "{\"code\":\"InvalidAuthentication\",\"message\":\"appSecret 不正确\"}");
        handle("/topapi/message/corpconversation/asyncsend_v2", 200, SEND_OK);

        ChannelSendResult result = sender().send(dingtalkAccount(), "staff-1", "在吗");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("InvalidAuthentication").contains("appSecret 不正确");
        assertThat(requestLines).hasSize(1);
    }

    @Test
    void reportsTransportFailureInsteadOfPretendingSuccess() {
        // 替身未注册该路径（HTTP 404）：如实记录调用失败，不冒成功
        ChannelSendResult unbound = sender().send(dingtalkAccount(), "staff-1", "在吗");
        assertThat(unbound.succeeded()).isFalse();
        assertThat(unbound.failureReason()).isNotBlank();

        // 非 JSON 响应（如网关返回 HTML）同样按失败处理
        handle("/v1.0/oauth2/accessToken", 200, "<html>bad gateway</html>");
        ChannelSendResult unreadable = sender().send(dingtalkAccount(), "staff-1", "在吗");
        assertThat(unreadable.succeeded()).isFalse();
        assertThat(unreadable.failureReason()).isNotBlank();
    }

    @Test
    void reusesCachedAccessTokenAcrossSendsWithinExpiry() {
        // 票面要求：7200s 访问凭证缓存复用——同一发送实例两次发送只取一次凭证
        handle("/v1.0/oauth2/accessToken", 200, TOKEN_OK);
        handle("/topapi/message/corpconversation/asyncsend_v2", 200, SEND_OK);
        DingtalkTextSender sender = sender();

        sender.send(dingtalkAccount(), "staff-1", "第一条");
        sender.send(dingtalkAccount(), "staff-2", "第二条");

        assertThat(requestLines).hasSize(3);
        assertThat(requestLines.get(2)).contains("access_token=ACCESS_TOKEN");
    }

    private DingtalkTextSender sender() {
        return new DingtalkTextSender(RestClient.builder(), baseUrl, baseUrl);
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
            byte[] body = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(status, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
    }
}
