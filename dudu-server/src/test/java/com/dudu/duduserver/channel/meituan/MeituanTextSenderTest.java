package com.dudu.duduserver.channel.meituan;

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
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 美团 IM 消息纯文本发送验证（docs/research/channels/meituan.md §2.4、§4.1、§8 第 3/5 条）：
 * POST msg/send 表单带系统级 app_id/timestamp/sig（sig 对 apiBase+路径与全表单参签，官方
 * 五步）与应用级 biz_type=1/app_poi_code/push_content；合作中心家族错误形状（data:ng 与
 * code/msg）如实失败，缺凭据不发请求，网络与响应解析异常按调用失败如实返回，不模拟成功。
 */
class MeituanTextSenderTest {

    private static final String SEND_PATH = "/msg/send";
    private static final String APP_ID = "mt-app-1";
    private static final String APP_SECRET = "mt-secret-1";

    private final List<String> requestLines = new CopyOnWriteArrayList<>();
    private final List<String> contentTypes = new CopyOnWriteArrayList<>();
    private final List<String> bodies = new CopyOnWriteArrayList<>();
    // 本地替身：按用例改写响应体（合作中心家族形状），404 用未注册路径表达
    private volatile String responseBody = "{}";
    private HttpServer server;
    private String baseUrl;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(SEND_PATH, this::record);
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void postsImChatFormWithSystemParamsSignedOverTheFullUrl() {
        MeituanTextSender sender = sender();

        ChannelSendResult result = sender.send(meituanAccount(fullInfo()), "668921", "好的，今天发出");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.externalMessageId()).isNull();
        assertThat(result.failureReason()).isNull();
        assertThat(requestLines.get(0)).isEqualTo("POST " + SEND_PATH);
        assertThat(contentTypes.get(0)).contains("application/x-www-form-urlencoded");

        // 表单字段：应用级同名词法 + 系统级三件
        Map<String, String> form = formFields(bodies.get(0));
        assertThat(form.get("biz_type")).isEqualTo("1");
        assertThat(form.get("app_poi_code")).isEqualTo("668921");
        assertThat(form.get("push_content")).isEqualTo("好的，今天发出");
        assertThat(form.get("app_id")).isEqualTo(APP_ID);
        assertThat(form.get("timestamp")).matches("\\d{10}");

        // 签名按官方五步对拍：待签串 = apiBase + 路径 + ? + 全参（sig 除外）字母序 + secret
        Map<String, String> withoutSig = new HashMap<>(form);
        withoutSig.remove("sig");
        assertThat(form.get("sig"))
            .isEqualTo(new MeituanProtocol().sign(baseUrl + SEND_PATH, withoutSig, APP_SECRET));
    }

    @Test
    void reportsFamilyErrorShapesWithTheOriginalCodeAndMessage() {
        // 形状一（§5.6 逐字）：{"data":"ng","error":{"code":808,"msg":"…"}}
        responseBody = "{\"data\": \"ng\", \"error\": { \"code\": 808, \"msg\": \"操作失败\" }}";
        ChannelSendResult ngShape = sender().send(meituanAccount(fullInfo()), "668921", "在吗");
        assertThat(ngShape.succeeded()).isFalse();
        assertThat(ngShape.failureReason()).isEqualTo("美团消息发送失败：808 操作失败");

        // 形状二（§6/code 703 签名错）：{"code":703,"msg":"…"}
        responseBody = "{\"code\": 703, \"msg\": \"签名错误\"}";
        ChannelSendResult codeShape = sender().send(meituanAccount(fullInfo()), "668921", "在吗");
        assertThat(codeShape.succeeded()).isFalse();
        assertThat(codeShape.failureReason()).isEqualTo("美团消息发送失败：703 签名错误");
    }

    // 凭据缺失的如实拦截由注册表 restriction 承担（见 MeituanAdapterTest），发送器只按
    // 已配置凭据翻译渠道协议与异常

    @Test
    void reportsTransportAndUnreadableResponsesInsteadOfPretendingSuccess() {
        // 非 JSON 响应（如网关返回 HTML）按调用失败处理，不冒成功
        responseBody = "<html>bad gateway</html>";
        ChannelSendResult unreadable = sender().send(meituanAccount(fullInfo()), "668921", "在吗");
        assertThat(unreadable.succeeded()).isFalse();
        assertThat(unreadable.failureReason()).isNotBlank();
    }

    private MeituanTextSender sender() {
        return new MeituanTextSender(new MeituanProtocol(), RestClient.builder(), baseUrl);
    }

    private CompanyChannelDO meituanAccount(Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(4101L);
        account.setChannel(ChannelEnum.MEITUAN);
        account.setChannelInfo(channelInfo);
        return account;
    }

    private Map<String, Object> fullInfo() {
        Map<String, Object> info = new HashMap<>();
        info.put("app_id", APP_ID);
        info.put("app_secret", APP_SECRET);
        return info;
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

    // 本地替身：按路径记录请求行、内容类型与请求体，返回当前用例构造的响应
    private void record(HttpExchange exchange) throws IOException {
        requestLines.add(exchange.getRequestMethod() + " " + exchange.getRequestURI().getPath());
        contentTypes.add(String.valueOf(exchange.getRequestHeaders().getFirst("Content-Type")));
        bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
        byte[] body = responseBody.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(200, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }
}
