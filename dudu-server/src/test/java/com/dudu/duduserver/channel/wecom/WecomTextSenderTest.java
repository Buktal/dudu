package com.dudu.duduserver.channel.wecom;

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
 * 企业微信文本发送实现验证：用本地 HTTP 替身按官方事实构造 access_token（91039）与
 * 发送应用消息（90236）的成功/失败响应（docs/research/channels/wecom.md §2/§6），验证
 * 换取凭据、下发报文与失败说明；不模拟成功、不掩盖渠道原始错误码。
 */
class WecomTextSenderTest {

    // 官方 91039 返回示例原文形状：{"errcode":0,"errmsg":"ok","access_token":"accesstoken000001","expires_in":7200}
    private static final String TOKEN_OK = "{\"errcode\":0,\"errmsg\":\"ok\","
        + "\"access_token\":\"accesstoken000001\",\"expires_in\":7200}";
    // 官方 90236 返回示例原文形状（节选）：errcode/errmsg + msgid
    private static final String SEND_OK = "{\"errcode\":0,\"errmsg\":\"ok\",\"invaliduser\":\"\","
        + "\"msgid\":\"MSGID_1000002\"}";

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
    void sendsApplicationTextWithDocumentedTokenAndPayload() {
        handle("/cgi-bin/gettoken", 200, TOKEN_OK);
        handle("/cgi-bin/message/send", 200, SEND_OK);

        ChannelSendResult result = sender().send(wechatAccount(
                Map.of("corpId", "ww_test_corp", "corpSecret", "test-corp-secret", "agentId", "1000002")),
            "zhangsan", "你好，想咨询发货时间");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.externalMessageId()).isEqualTo("MSGID_1000002");
        assertThat(result.failureReason()).isNull();
        assertThat(requestLines.get(0))
            .startsWith("GET /cgi-bin/gettoken?")
            .contains("corpid=ww_test_corp")
            .contains("corpsecret=test-corp-secret");
        assertThat(requestLines.get(1)).startsWith("POST /cgi-bin/message/send?")
            .contains("access_token=accesstoken000001");
        JSONObject payload = JSONUtil.parseObj(bodies.get(1));
        assertThat(payload.getStr("touser")).isEqualTo("zhangsan");
        assertThat(payload.getStr("msgtype")).isEqualTo("text");
        assertThat(payload.getStr("agentid")).isEqualTo("1000002");
        assertThat(payload.getJSONObject("text").getStr("content")).isEqualTo("你好，想咨询发货时间");
    }

    @Test
    void reportsChannelRejectionWithTheOriginalErrorCodeAndMessage() {
        // 官方 90236：全部接收人无权限或不存在时本次调用失败，errcode=81013
        handle("/cgi-bin/gettoken", 200, TOKEN_OK);
        handle("/cgi-bin/message/send", 200, "{\"errcode\":81013,\"errmsg\":\"user not found\"}");

        ChannelSendResult result = sender().send(wechatAccount(
            Map.of("corpId", "ww_test_corp", "corpSecret", "test-corp-secret", "agentId", "1000002")),
            "zhangsan", "在吗");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.externalMessageId()).isNull();
        assertThat(result.failureReason()).contains("81013").contains("user not found");
    }

    @Test
    void reportsTokenFailureWithoutCallingTheSendEndpoint() {
        handle("/cgi-bin/gettoken", 200,
            "{\"errcode\":60020,\"errmsg\":\"not allow to access from your ip\"}");
        handle("/cgi-bin/message/send", 200, SEND_OK);

        ChannelSendResult result = sender().send(wechatAccount(
            Map.of("corpId", "ww_test_corp", "corpSecret", "test-corp-secret", "agentId", "1000002")),
            "zhangsan", "在吗");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("60020").contains("not allow to access from your ip");
        assertThat(requestLines).hasSize(1);
    }

    @Test
    void reportsTransportFailureInsteadOfPretendingSuccess() {
        // 替身未注册该路径（HTTP 404）：如实记录调用失败，不冒成功
        ChannelSendResult unbound = sender().send(wechatAccount(
                Map.of("corpId", "ww_test_corp", "corpSecret", "test-corp-secret", "agentId", "1000002")),
            "zhangsan", "在吗");
        assertThat(unbound.succeeded()).isFalse();
        assertThat(unbound.failureReason()).isNotBlank();

        // 非 JSON 响应（如网关返回 HTML）同样按失败处理
        handle("/cgi-bin/gettoken", 200, "<html>bad gateway</html>");
        ChannelSendResult unreadable = sender().send(wechatAccount(
            Map.of("corpId", "ww_test_corp", "corpSecret", "test-corp-secret", "agentId", "1000002")),
            "zhangsan", "在吗");
        assertThat(unreadable.succeeded()).isFalse();
        assertThat(unreadable.failureReason()).isNotBlank();
    }

    private WecomTextSender sender() {
        return new WecomTextSender(RestClient.builder(), baseUrl);
    }

    private CompanyChannelDO wechatAccount(Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(9302L);
        account.setChannel(ChannelEnum.WECOM);
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
