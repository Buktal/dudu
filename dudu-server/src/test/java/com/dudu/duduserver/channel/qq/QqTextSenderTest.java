package com.dudu.duduserver.channel.qq;

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
 * QQ 纯文本发送实现验证：本地 HTTP 替身按官方事实构造 access_token（access-token 页，
 * 失败响应 {code,message} 且 HTTP 恒 200）与单聊/群发送（qq.md §5.8/§5.9）的成功/失败
 * 响应，验证凭据换取、场景路由（c2c→/v2/users、group→/v2/groups、guild 如实受限）与
 * 失败说明；不模拟成功、不掩盖渠道原始错误码。
 */
class QqTextSenderTest {

    // 官方 access-token 页响应形状：成功 expires_in 为字符串（表格口径 number，解析按两者兼容）
    private static final String TOKEN_OK = "{\"access_token\":\"ACCESS_TOKEN_1\",\"expires_in\":\"7200\"}";
    private static final String TOKEN_INVALID = "{\"code\":\"100016\",\"message\":\"invalid appid or secret\"}";
    // 官方单聊/群发送响应形状（§5.8/§5.9）：成功体直接业务数据
    private static final String SEND_OK = "{\"id\":\"ROBOT1.0_send_1\",\"timestamp\":\"2026-07-21T10:30:00+08:00\"}";
    // 官方去重失败（overview/发送页错误码表）：失败体 {err_code, message, trace_id}
    private static final String SEND_DEDUP = "{\"err_code\":40054005,\"message\":\"消息被去重\","
        + "\"trace_id\":\"TRACE_1\"}";

    private final List<String> requestLines = new CopyOnWriteArrayList<>();
    private final List<String> bodies = new CopyOnWriteArrayList<>();
    private final List<String> authHeaders = new CopyOnWriteArrayList<>();
    private HttpServer server;
    private String baseUrl;
    // 替身响应按用例切换（HttpServer 同一路径不可重复注册）
    private volatile String tokenBody = TOKEN_OK;
    private volatile String userSendBody = SEND_OK;

    @BeforeEach
    void startServer() throws IOException {
        tokenBody = TOKEN_OK;
        userSendBody = SEND_OK;
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        // 官方 access-token 页：POST /app/getAppAccessToken，HTTP 恒 200，按 code 判定失败
        server.createContext("/app/getAppAccessToken", exchange -> {
            requestLines.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
            bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            respond(exchange, tokenBody);
        });
        // 官方 §5.8 单聊发送：POST /v2/users/{user_openid}/messages
        server.createContext("/v2/users", exchange -> {
            requestLines.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
            bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            authHeaders.add(exchange.getRequestHeaders().getFirst("Authorization"));
            respond(exchange, userSendBody);
        });
        // 官方 §5.9 群发送：POST /v2/groups/{group_openid}/messages
        server.createContext("/v2/groups", exchange -> {
            requestLines.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
            bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            authHeaders.add(exchange.getRequestHeaders().getFirst("Authorization"));
            respond(exchange, SEND_OK);
        });
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void sendsC2cTextWithDocumentedTokenEndpointAndAuthorization() {
        ChannelSendResult result = sender().send(account(), "c2c:C2C_OPENID_1", "你好，想咨询发货时间");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.externalMessageId()).isEqualTo("ROBOT1.0_send_1");
        assertThat(requestLines.get(0)).isEqualTo("POST /app/getAppAccessToken");
        JSONObject tokenPayload = JSONUtil.parseObj(bodies.get(0));
        assertThat(tokenPayload.getStr("appId")).isEqualTo("APPID_1");
        assertThat(tokenPayload.getStr("clientSecret")).isEqualTo("SECRET_1");
        assertThat(requestLines.get(1)).isEqualTo("POST /v2/users/C2C_OPENID_1/messages");
        assertThat(authHeaders.get(0)).isEqualTo("QQBot ACCESS_TOKEN_1");
        JSONObject payload = JSONUtil.parseObj(bodies.get(1));
        assertThat(payload.getStr("content")).isEqualTo("你好，想咨询发货时间");
        assertThat(payload.getInt("msg_type")).isZero();
    }

    @Test
    void routesGroupConversationsToTheGroupEndpoint() {
        ChannelSendResult result = sender().send(account(), "group:GROUP_OPENID_1", "欢迎使用本群助手");

        assertThat(result.succeeded()).isTrue();
        assertThat(requestLines.get(1)).isEqualTo("POST /v2/groups/GROUP_OPENID_1/messages");
        assertThat(JSONUtil.parseObj(bodies.get(1)).getStr("content")).isEqualTo("欢迎使用本群助手");
    }

    @Test
    void reportsTokenFailureByCodeFieldWithoutCallingTheSendEndpoint() {
        // 官方 access-token 页：失败响应 {code,message}，HTTP 恒 200，依据 code 判断
        tokenBody = TOKEN_INVALID;

        ChannelSendResult result = sender().send(account(), "c2c:C2C_OPENID_1", "在吗");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("100016").contains("invalid appid or secret");
        // 令牌失败后不再调用发送接口
        assertThat(requestLines).hasSize(1);
    }

    @Test
    void reportsChannelRejectionWithTheOriginalErrCodeAndMessage() {
        // 官方去重失败：同 msg_id+msg_seq 重发失败 40054005
        userSendBody = SEND_DEDUP;

        ChannelSendResult result = sender().send(account(), "c2c:C2C_OPENID_1", "再发一次");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.externalMessageId()).isNull();
        assertThat(result.failureReason()).contains("40054005").contains("消息被去重").contains("TRACE_1");
    }

    @Test
    void guildConversationsAndUnroutableIdentitiesFailWithoutCallingTheChannel() {
        // 频道发送要求 WS 在线（官方 §5.12），本票未接入：如实失败且零渠道调用
        ChannelSendResult guild = sender().send(account(), "guild:1234", "频道回复");
        assertThat(guild.succeeded()).isFalse();
        assertThat(guild.failureReason()).contains("频道");

        // 无场景前缀的身份无法路由发送端点，同样零渠道调用
        ChannelSendResult unroutable = sender().send(account(), "bare-openid", "频道回复");
        assertThat(unroutable.succeeded()).isFalse();
        assertThat(unroutable.failureReason()).isNotBlank();
        assertThat(requestLines).isEmpty();
    }

    @Test
    void reportsTransportFailureInsteadOfPretendingSuccess() {
        // 非 JSON 响应（如网关返回 HTML）按调用失败处理
        tokenBody = "<html>bad gateway</html>";
        ChannelSendResult unreadable = sender().send(account(), "c2c:C2C_OPENID_2", "在吗");
        assertThat(unreadable.succeeded()).isFalse();
        assertThat(unreadable.failureReason()).isNotBlank();

        // 服务不可达（连接拒绝）同样如实记录调用失败，不冒成功
        server.stop(0);
        ChannelSendResult unreachable = sender().send(account(), "c2c:C2C_OPENID_2", "在吗");
        assertThat(unreachable.succeeded()).isFalse();
        assertThat(unreachable.failureReason()).isNotBlank();
    }

    private QqTextSender sender() {
        return new QqTextSender(RestClient.builder(), baseUrl);
    }

    private CompanyChannelDO account() {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(9603L);
        account.setChannel(ChannelEnum.QQ);
        account.setChannelInfo(Map.of("appId", "APPID_1", "appSecret", "SECRET_1"));
        return account;
    }

    // 本地替身：按路径记录请求行与请求体，返回构造好的官方形状响应
    private void respond(com.sun.net.httpserver.HttpExchange exchange, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
