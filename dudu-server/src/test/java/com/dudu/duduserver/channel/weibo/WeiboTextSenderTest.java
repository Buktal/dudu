package com.dudu.duduserver.channel.weibo;

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
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 微博客服消息纯文本主动回复验证（docs/research/channels/weibo.md §6、§6.1）：POST
 * reply.json 以 form 表单下发（access_token 直配于 channel_info，无需换取），data 为
 * JSON URLEncode UTF-8 串；成功以 result==true 为准（官方只给成功示例，不返回消息标识），
 * 失败原样记录渠道错误码，缺凭据与调用异常如实说明，不模拟成功。
 */
class WeiboTextSenderTest {

    private static final String SEND_PATH = "/2/messages/reply.json";

    private final List<String> requestLines = new CopyOnWriteArrayList<>();
    private final List<String> contentTypes = new CopyOnWriteArrayList<>();
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
    void postsCustomerServiceTextAsUrlEncodedFormWithConfiguredAccessToken() {
        // 官方成功返回形状：result 布尔为真，无消息标识
        handle(SEND_PATH, 200,
            "{\"result\": true, \"sender_id\": \"123\", \"receiver_id\": \"2489518277\","
                + " \"type\": \"text\", \"data\": \"%7B%22text%22%3A%22ok%22%7D\"}");
        WeiboTextSender sender = sender();

        ChannelSendResult result = sender.send(weiboAccount(Map.of("accessToken", "wb-token-1")),
            "2489518277", "你好，想咨询发货时间");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.externalMessageId()).isNull();
        assertThat(result.failureReason()).isNull();
        assertThat(requestLines.get(0)).startsWith("POST " + SEND_PATH + "?")
            .contains("access_token=wb-token-1");
        assertThat(contentTypes.get(0)).contains("application/x-www-form-urlencoded");
        Map<String, String> form = formFields(bodies.get(0));
        assertThat(form.get("receiver_id")).isEqualTo("2489518277");
        assertThat(form.get("type")).isEqualTo("text");
        // data 为 JSON URLEncode 后的字符串，UTF-8 编码
        assertThat(JSONUtil.parseObj(form.get("data")).getStr("text")).isEqualTo("你好，想咨询发货时间");
    }

    @Test
    void reportsChannelRejectionWithTheOriginalErrorCodeAndMessage() {
        // 微博开放平台通用错误形状（官方页未给错误示例，按 error_code/error 键如实透传）
        handle(SEND_PATH, 200,
            "{\"request\": \"/2/messages/reply.json\", \"error_code\": \"30001\","
                + " \"error\": \"REMOTE_SERVICE_ERROR\"}");
        WeiboTextSender sender = sender();

        ChannelSendResult result = sender.send(weiboAccount(Map.of("accessToken", "wb-token-1")),
            "2489518277", "在吗");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.externalMessageId()).isNull();
        assertThat(result.failureReason())
            .contains("30001")
            .contains("REMOTE_SERVICE_ERROR");
    }

    // 凭据缺失的如实拦截由注册表 restriction 承担（见 WeiboAdapterTest），发送器只按
    // 已配置凭据翻译渠道协议与异常

    @Test
    void reportsTransportAndUnreadableResponsesInsteadOfPretendingSuccess() {
        // 替身未注册该路径（HTTP 404）：如实记录调用失败，不冒成功
        ChannelSendResult unbound = sender().send(weiboAccount(Map.of("accessToken", "wb-token-1")),
            "2489518277", "在吗");
        assertThat(unbound.succeeded()).isFalse();
        assertThat(unbound.failureReason()).isNotBlank();

        // 非 JSON 响应（如网关返回 HTML）同样按失败处理
        handle(SEND_PATH, 200, "<html>bad gateway</html>");
        ChannelSendResult unreadable = sender().send(weiboAccount(Map.of("accessToken", "wb-token-1")),
            "2489518277", "在吗");
        assertThat(unreadable.succeeded()).isFalse();
        assertThat(unreadable.failureReason()).isNotBlank();
    }

    private WeiboTextSender sender() {
        return new WeiboTextSender(RestClient.builder(), baseUrl);
    }

    private CompanyChannelDO weiboAccount(Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannel(ChannelEnum.WEIBO);
        account.setChannelInfo(channelInfo);
        return account;
    }

    // form 表单还原：按 & 与 = 切分后逐段 URLDecode
    private Map<String, String> formFields(String body) {
        Map<String, String> fields = new HashMap<>();
        for (String pair : body.split("&")) {
            int eq = pair.indexOf('=');
            fields.put(URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8),
                URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8));
        }
        return fields;
    }

    // 本地替身：按路径记录请求行、内容类型与请求体，返回构造好的官方形状响应
    private void handle(String path, int status, String response) {
        server.createContext(path, exchange -> {
            requestLines.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
            contentTypes.add(String.valueOf(exchange.getRequestHeaders().getFirst("Content-Type")));
            bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] body = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(status, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
    }
}
