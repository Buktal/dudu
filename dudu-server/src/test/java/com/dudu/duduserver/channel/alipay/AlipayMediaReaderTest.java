package com.dudu.duduserver.channel.alipay;

import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.channel.support.ChannelRestrictions;
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

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 支付宝媒体下载验证（docs/research/channels/alipay.md §2.3）：POST 媒体网关
 * chat/multimedia.do（与消息网关分离），接口 alipay.mobile.public.multimedia.download，
 * biz_content {"mediaId":…}，加签方式同普通 OpenAPI 请求；成功时 HTTP 响应体即图片内容
 * （Content-Type 图片类型，无 JSON 信封）；失败与缺凭据如实说明，不模拟成功。
 */
class AlipayMediaReaderTest {

    private static final String MEDIA_PATH = "/chat/multimedia.do";
    private static final byte[] IMAGE_BYTES = new byte[]{(byte) 0x89, 'P', 'N', 'G', 1, 2, 3, 4};

    // 平台公钥（回调验签用）：媒体链路不解析它，但凭据集要求三键齐全
    private static final String ALIPAY_PUBLIC_KEY = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA";

    private static KeyPair keyPair;

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
    void postsSignedMediaDownloadFormAndReturnsImageBytes() throws Exception {
        server.createContext(MEDIA_PATH, exchange -> {
            bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            exchange.getResponseHeaders().set("Content-Type", "image/jpeg");
            exchange.sendResponseHeaders(200, IMAGE_BYTES.length);
            exchange.getResponseBody().write(IMAGE_BYTES);
            exchange.close();
        });

        ChannelMediaResult result = reader().read(alipayAccount(), "abc123");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.bytes()).isEqualTo(IMAGE_BYTES);
        assertThat(result.contentType()).isEqualTo("image/jpeg");

        Map<String, String> form = formFields(bodies.get(0));
        assertThat(form.get("method")).isEqualTo("alipay.mobile.public.multimedia.download");
        assertThat(form.get("app_id")).isEqualTo("2014072300007148");
        assertThat(form.get("sign_type")).isEqualTo("RSA2");
        assertThat(cn.hutool.json.JSONUtil.parseObj(form.get("biz_content")).getStr("mediaId")).isEqualTo("abc123");

        // 请求签名独立复核（与发送同款加签规则）
        Signature verifier = Signature.getInstance("SHA256withRSA");
        verifier.initVerify(keyPair.getPublic());
        verifier.update(toVerifyString(form).getBytes(StandardCharsets.UTF_8));
        assertThat(verifier.verify(Base64.getDecoder().decode(form.get("sign")))).isTrue();
    }

    @Test
    void reportsFailureInsteadOfPretendingMedia() {
        // 非 2xx/非图片响应：如实失败，不构造假媒体
        server.createContext(MEDIA_PATH, exchange -> {
            byte[] body = "{\"error_response\":{\"code\":\"40004\",\"sub_msg\":\"无效媒体\"}}"
                .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });

        ChannelMediaResult result = reader().read(alipayAccount(), "abc123");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.bytes()).isNull();
        assertThat(result.failureReason()).isNotBlank();
    }

    @Test
    void reportsMissingCredentialsWithoutCallingTheEndpoint() {
        CompanyChannelDO bare = new CompanyChannelDO();
        bare.setChannel(ChannelEnum.ALIPAY);
        bare.setChannelInfo(Map.of());

        ChannelMediaResult result = reader().read(bare, "abc123");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).isEqualTo(ChannelRestrictions.MEDIA_CREDENTIALS_MISSING);
        assertThat(bodies).isEmpty();
    }

    private AlipayMediaReader reader() {
        return new AlipayMediaReader(RestClient.builder(), baseUrl);
    }

    private CompanyChannelDO alipayAccount() {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannel(ChannelEnum.ALIPAY);
        account.setChannelInfo(Map.of("appId", "2014072300007148",
            "appPrivateKey", Base64.getMimeEncoder().encodeToString(keyPair.getPrivate().getEncoded()),
            "alipayPublicKey", ALIPAY_PUBLIC_KEY));
        return account;
    }

    // 待签串独立构造：剔除 sign 与空值参数，ASCII 升序 k=v& 拼接（§4.1）
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

    private Map<String, String> formFields(String body) {
        Map<String, String> fields = new HashMap<>();
        for (String pair : body.split("&")) {
            int eq = pair.indexOf('=');
            fields.put(URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8),
                URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8));
        }
        return fields;
    }
}
