package com.dudu.duduserver.channel.alipay;

import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 支付宝客服消息纯文本发送验证（docs/research/channels/alipay.md §2.3、§4.1）：POST
 * gateway.do 表单公共参数（app_id/method/format/charset/sign_type/timestamp/version）+
 * biz_content {to_user_id, msg_type:text, text:{content}}；请求加签剔除 sign 与空值参数
 * （sign_type 参与），SHA256WithRSA 后 Base64；成功以 code=10000 为准（接口不返回消息
 * 标识），失败原样记录 code 与 sub_msg；响应验签需支付宝公钥（不在凭据集）不做，凭据缺失
 * 与调用异常如实说明，不模拟成功。
 */
class AlipayTextSenderTest {

    private static final String SEND_PATH = "/gateway.do";
    private static final Pattern TIMESTAMP = Pattern.compile("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}");

    // 平台公钥（回调验签用）：发送链路不解析它，但凭据集要求三键齐全
    private static final String ALIPAY_PUBLIC_KEY = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA";

    private static KeyPair keyPair;

    private final List<String> contentTypes = new CopyOnWriteArrayList<>();
    private final List<String> bodies = new CopyOnWriteArrayList<>();
    private HttpServer server;
    private String baseUrl;

    @BeforeAll
    static void generateKeyPair() throws Exception {
        keyPair = KeyPairGenerator.getInstance("RSA").genKeyPair();
    }

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
    void postsSignedTextCustomSendFormToGateway() throws Exception {
        // 官方成功返回形状：code=10000（无消息标识）
        handle(SEND_PATH, 200,
            "{\"alipay_open_public_message_custom_send_response\":{\"code\":\"10000\",\"msg\":\"Success\"}}");

        ChannelSendResult result = sender().send(alipayAccount(), "2088102111111111", "你好，已收到您的咨询");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.externalMessageId()).isNull();
        assertThat(result.failureReason()).isNull();
        assertThat(bodies).hasSize(1);
        assertThat(contentTypes.get(0)).contains("application/x-www-form-urlencoded");

        Map<String, String> form = formFields(bodies.get(0));
        assertThat(form.get("method")).isEqualTo("alipay.open.public.message.custom.send");
        assertThat(form.get("app_id")).isEqualTo("2014072300007148");
        assertThat(form.get("format")).isEqualTo("JSON");
        assertThat(form.get("charset")).isEqualTo("utf-8");
        assertThat(form.get("sign_type")).isEqualTo("RSA2");
        assertThat(form.get("version")).isEqualTo("1.0");
        assertThat(TIMESTAMP.matcher(form.get("timestamp")).matches()).isTrue();
        assertThat(JSONUtil.parseObj(form.get("biz_content")).getStr("to_user_id")).isEqualTo("2088102111111111");
        assertThat(JSONUtil.parseObj(form.get("biz_content")).getStr("msg_type")).isEqualTo("text");
        assertThat(JSONUtil.parseObj(form.get("biz_content")).getJSONObject("text").getStr("content"))
            .isEqualTo("你好，已收到您的咨询");

        // 请求签名独立复核：剔除 sign 与空值参数、ASCII 升序 k=v& 后 SHA256WithRSA 可验
        assertThat(form.get("sign")).isNotBlank();
        Signature verifier = Signature.getInstance("SHA256withRSA");
        verifier.initVerify(keyPair.getPublic());
        verifier.update(toVerifyString(form).getBytes(StandardCharsets.UTF_8));
        assertThat(verifier.verify(Base64.getDecoder().decode(form.get("sign")))).isTrue();
    }

    @Test
    void reportsChannelRejectionWithTheOriginalCodeAndMessage() {
        // 业务失败形状：响应节点 code!=10000 携带 sub_msg（如频率超限、48h 窗口外）
        handle(SEND_PATH, 200,
            "{\"alipay_open_public_message_custom_send_response\":{\"code\":\"20000\",\"msg\":\"Failure\","
                + "\"sub_code\":\"isp.usr-interaction-timeout\",\"sub_msg\":\"48 小时内未交互\"}}");

        ChannelSendResult result = sender().send(alipayAccount(), "2088102111111111", "在吗");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.externalMessageId()).isNull();
        assertThat(result.failureReason())
            .contains("20000")
            .contains("isp.usr-interaction-timeout")
            .contains("48 小时内未交互");
    }

    @Test
    void reportsMissingCredentialsWithoutCallingTheEndpoint() {
        handle(SEND_PATH, 200, "{\"alipay_open_public_message_custom_send_response\":{\"code\":\"10000\"}}");

        CompanyChannelDO bare = new CompanyChannelDO();
        bare.setChannel(ChannelEnum.ALIPAY);
        bare.setChannelInfo(Map.of());

        ChannelSendResult result = sender().send(bare, "2088102111111111", "在吗");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).isEqualTo("渠道发送凭据未配置");
        assertThat(bodies).isEmpty();
    }

    @Test
    void reportsTransportAndUnreadableResponsesInsteadOfPretendingSuccess() {
        // 替身未注册该路径（HTTP 404）：如实记录调用失败，不冒成功
        ChannelSendResult unbound = sender().send(alipayAccount(), "2088102111111111", "在吗");
        assertThat(unbound.succeeded()).isFalse();
        assertThat(unbound.failureReason()).isNotBlank();

        // 非 JSON 响应（如网关返回 HTML）同样按失败处理
        handle(SEND_PATH, 200, "<html>bad gateway</html>");
        ChannelSendResult unreadable = sender().send(alipayAccount(), "2088102111111111", "在吗");
        assertThat(unreadable.succeeded()).isFalse();
        assertThat(unreadable.failureReason()).isNotBlank();
    }

    private AlipayTextSender sender() {
        return new AlipayTextSender(RestClient.builder(), baseUrl);
    }

    private CompanyChannelDO alipayAccount() {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannel(ChannelEnum.ALIPAY);
        account.setChannelInfo(Map.of("appId", "2014072300007148",
            "appPrivateKey", Base64.getMimeEncoder().encodeToString(keyPair.getPrivate().getEncoded()),
            "alipayPublicKey", ALIPAY_PUBLIC_KEY));
        return account;
    }

    // 待签串独立构造：剔除 sign 与空值参数，ASCII 升序 k=v& 拼接（§4.1，sign_type 参与）
    private String toVerifyString(Map<String, String> form) {
        Map<String, String> sorted = new java.util.TreeMap<>(form);
        sorted.remove("sign");
        sorted.values().removeIf(value -> value == null || value.isEmpty());
        StringBuilder toVerify = new StringBuilder();
        for (Map.Entry<String, String> entry : sorted.entrySet()) {
            if (toVerify.length() > 0) {
                toVerify.append('&');
            }
            toVerify.append(entry.getKey()).append('=').append(entry.getValue());
        }
        return toVerify.toString();
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

    // 本地替身：按路径记录内容类型与请求体，返回构造好的官方形状响应
    private void handle(String path, int status, String response) {
        server.createContext(path, exchange -> {
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
