package com.dudu.duduserver.channel.telegram;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.constant.ChannelEnum;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Telegram 纯文本发送验证（docs/research/channels/telegram.md §5.3、§6）：POST
 * {@code <bot 基址>/sendMessage}——channel_info 的 url 为含 {@code /bot<token>} 路径段
 * 的 Bot API 基址（官方 §5.4 形态，token 走 URL 路径鉴权，两凭据键与 mock-pulse
 * config.rs 一致），报文 {@code chat_id + text} 按官方包络；成功以 2XY 且 ok=true 为准
 * 并取 result.message_id 作渠道消息标识，失败包络 {@code ok:false + error_code/
 * description/parameters.retry_after} 与无法识别的响应如实失败，缺凭据不发请求，
 * 网络异常按调用失败如实返回，不模拟成功。
 */
class TelegramTextSenderTest {

    // 官方教程页 token 原文形态：URL 路径 bot<token> 鉴权
    private static final String BOT_TOKEN = "4839574812:AAFD39kkdpWt3ywyRZergyOLMaJhac60qc";
    private static final String SEND_PATH = "/bot" + BOT_TOKEN + "/sendMessage";
    private static final String SEND_OK =
        "{\"ok\":true,\"result\":{\"message_id\":1365,\"date\":1441645532,\"text\":\"Hello World!\"}}";
    // 频控失败包络（§5.3 + #responseparameters 形状）
    private static final String SEND_FLOOD =
        "{\"ok\":false,\"error_code\":429,\"description\":\"Too Many Requests\","
            + "\"parameters\":{\"retry_after\":3}}";
    private static final String SEND_BAD_REQUEST =
        "{\"ok\":false,\"error_code\":400,\"description\":\"Bad Request: message text is empty\"}";

    private final List<String> requestLines = new CopyOnWriteArrayList<>();
    private final List<String> contentTypes = new CopyOnWriteArrayList<>();
    private final List<String> bodies = new CopyOnWriteArrayList<>();
    // 本地替身：按用例改写响应体与状态码（官方包络形状）
    private volatile String responseBody = SEND_OK;
    private volatile int responseStatus = 200;
    private HttpServer server;
    private String botBase;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(SEND_PATH, this::record);
        server.start();
        // channel_info.url = 含 bot<token> 路径段的 Bot API 基址
        botBase = "http://127.0.0.1:" + server.getAddress().getPort() + "/bot" + BOT_TOKEN;
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void postsSendMessageJsonWithTokenInPathAndSavesMessageId() {
        ChannelSendResult result = sender().send(account(), "1111111", "好的，今天发出");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.externalMessageId()).isEqualTo("1365");
        assertThat(result.failureReason()).isNull();
        assertThat(requestLines.get(0)).isEqualTo("POST " + SEND_PATH);
        assertThat(contentTypes.get(0)).contains("application/json");

        // 请求报文按官方 §5.3 包络：chat_id 数字形态 + text（官方样本 chat_id: 123456789）
        JSONObject body = JSONUtil.parseObj(bodies.get(0));
        assertThat(body.get("chat_id")).isEqualTo(1111111);
        assertThat(body.getStr("text")).isEqualTo("好的，今天发出");
    }

    @Test
    void postsNonNumericChatIdAsStringExactlyAsGiven() {
        // chat_id 官方类型 Integer or String：非数字标识原样按字符串下发
        sender().send(account(), "@channelusername", "好的，今天发出");

        JSONObject body = JSONUtil.parseObj(bodies.get(0));
        assertThat(body.get("chat_id")).isEqualTo("@channelusername");
    }

    @Test
    void reportsChannelFailureEnvelopeHonestlyWithoutFakingSuccess() {
        responseBody = SEND_FLOOD;

        ChannelSendResult flood = sender().send(account(), "1111111", "稍等，我查一下");

        assertThat(flood.succeeded()).isFalse();
        assertThat(flood.externalMessageId()).isNull();
        assertThat(flood.failureReason()).contains("429").contains("Too Many Requests").contains("retry_after");

        // 400 族：文本超限等渠道拒绝同样如实落库
        responseBody = SEND_BAD_REQUEST;
        ChannelSendResult rejected = sender().send(account(), "1111111", "稍等，我查一下");
        assertThat(rejected.failureReason()).contains("400").contains("message text is empty");
    }

    @Test
    void reportsNonEnvelopeResponsesAndHttpErrorsAsFailures() {
        // 非 JSON 形态（如反代错误页）不是 ok=true：不能当成功
        responseBody = "<html>502 Bad Gateway</html>";
        ChannelSendResult unrecognizable = sender().send(account(), "1111111", "稍等，我查一下");
        assertThat(unrecognizable.succeeded()).isFalse();
        assertThat(unrecognizable.failureReason()).contains("响应无法识别");

        // HTTP 非 2XY 但包络仍是官方错误形状：按包络如实描述
        responseStatus = 401;
        responseBody = "{\"ok\":false,\"error_code\":401,\"description\":\"Unauthorized\"}";
        ChannelSendResult unauthorized = sender().send(account(), "1111111", "稍等，我查一下");
        assertThat(unauthorized.succeeded()).isFalse();
        assertThat(unauthorized.failureReason()).contains("401").contains("Unauthorized");
    }

    // 凭据缺失的如实拦截由注册表 restriction 承担（见 TelegramAdapterTest），发送器只按
    // 已配置凭据翻译渠道协议与异常

    private TelegramTextSender sender() {
        return new TelegramTextSender(RestClient.builder());
    }

    private void record(HttpExchange exchange) throws IOException {
        requestLines.add(exchange.getRequestMethod() + " " + exchange.getRequestURI().getPath());
        contentTypes.add(String.valueOf(exchange.getRequestHeaders().getFirst("Content-Type")));
        bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
        byte[] body = responseBody.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(responseStatus, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }

    private CompanyChannelDO account() {
        Map<String, Object> info = new HashMap<>();
        info.put("url", botBase);
        info.put("secretToken", "dudu-secret-token");
        return account(info);
    }

    private CompanyChannelDO account(Map<String, Object> info) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(4107L);
        account.setCompanyId(1L);
        account.setChannel(ChannelEnum.TELEGRAM);
        account.setAccountName("Telegram");
        account.setChannelInfo(info);
        return account;
    }
}
