package com.dudu.duduserver.channel.wechatmp;

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
 * 公众号文本发送薄层装配冒烟：协议行为由微信族骨架 WechatTextSender 的合并用例验收
 * （channel/support/WechatTextSenderTest），此处只验证薄层把公众号的 api-base 覆盖、
 * channel_info 凭据读取与委托接线配对正确（docs/research/channels/wechat-mp.md §6）。
 */
class WechatMpTextSenderTest {

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
    void sendsTextThroughTheFamilySkeletonWithTheChannelCredentialsAndApiBase() {
        handle("/cgi-bin/token", 200, TOKEN_OK);
        handle("/cgi-bin/message/custom/send", 200, SEND_OK);
        WechatMpTextSender sender = new WechatMpTextSender(RestClient.builder(), baseUrl);

        ChannelSendResult result = sender.send(wechatAccount(
                Map.of("appId", "wx_test_appid", "appSecret", "test-app-secret")),
            "oMgHVjngRipVsoxg6TuX3vz6glDg", "你好，想咨询发货时间");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.failureReason()).isNull();
        // 请求到达本替身即证明 api-base 绑定；凭据读取经公众号 Credentials 原样进入换取请求
        assertThat(requestLines.get(0))
            .startsWith("GET /cgi-bin/token?")
            .contains("grant_type=client_credential")
            .contains("appid=wx_test_appid")
            .contains("secret=test-app-secret");
        assertThat(requestLines.get(1)).startsWith("POST /cgi-bin/message/custom/send?")
            .contains("access_token=ACCESS_TOKEN");
        JSONObject payload = JSONUtil.parseObj(bodies.get(1));
        assertThat(payload.getStr("touser")).isEqualTo("oMgHVjngRipVsoxg6TuX3vz6glDg");
        assertThat(payload.getStr("msgtype")).isEqualTo("text");
        assertThat(payload.getJSONObject("text").getStr("content")).isEqualTo("你好，想咨询发货时间");
    }

    // ---- 夹具 ----

    private CompanyChannelDO wechatAccount(Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannel(ChannelEnum.WECHAT_MP);
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
