package com.dudu.duduserver.channel.kuaishou;

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
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 快手智能客服发送验收（事实见 docs/research/channels/kuaishou.md §6.5.2 与 §4.3）：
 * POST /open/cs/intelligent/message/send form 参数族齐全（method/version/access_token/
 * appkey/signMethod=MD5/sign/timestamp 毫秒/param），签名按官方 SDK 算法在测试内独立
 * 重算比对（key 字典序 k=v& 拼接 + &signSecret= 后缀取 MD5 小写 hex，sign 不参签）；
 * param 业务报文按入参表逐字段核对（toUser 买家 role=1、fromUser 商家 role=2、
 * generator=1、type=1、requestId、messageList 文本 content 为 JSON 字符串）；成功以
 * result=1 为准并以 requestId 作外部消息标识，渠道错误与凭据/访客缺失如实失败。
 */
class KuaishouTextSenderTest {

    private static final String SIGN_SECRET = "1a2b3c4d5e6f7a8b9c0d";

    private final CopyOnWriteArrayList<String> requestLines = new CopyOnWriteArrayList<>();
    private final CopyOnWriteArrayList<Map<String, String>> forms = new CopyOnWriteArrayList<>();
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
    void sendsSignedFormAndReportsRequestIdAsExternalMessageId() {
        handle(200, "{\"result\":1,\"error_msg\":\"SUCCESS\"}");

        ChannelSendResult result = sender("小明").send(account(), "buyer-open-1", "在的，稍等");

        assertThat(result.succeeded()).isTrue();
        // 出参无渠道消息 ID：requestId（param 内的幂等请求标识）作外部消息标识
        assertThat(result.externalMessageId()).isNotBlank();

        assertThat(requestLines).hasSize(1);
        assertThat(requestLines.get(0)).startsWith("POST /open/cs/intelligent/message/send");

        // form 参数族齐全（官方 CURL 示例逐字字段），param 经 form 解码还原
        Map<String, String> form = forms.get(0);
        assertThat(form.get("method")).isEqualTo("open.cs.intelligent.message.send");
        assertThat(form.get("version")).isEqualTo("1");
        assertThat(form.get("appkey")).isEqualTo("ks696650570360602063");
        assertThat(form.get("signMethod")).isEqualTo("MD5");
        assertThat(form.get("access_token")).isEqualTo("KwaiAccessTokenSample");
        assertThat(form.get("timestamp")).matches("\\d{13}");
        assertThat(form.get("param")).isNotBlank();

        // 签名独立重算（官方 SDK sortAndJoin 算法）：不依赖被测代码的签名实现
        assertThat(form.get("sign")).isEqualTo(expectedSign(withoutSign(form)));

        // param 业务报文逐字段核对（§6.5.2 入参表）
        JSONObject param = JSONUtil.parseObj(form.get("param"));
        assertThat(param.getInt("type")).isEqualTo(1);
        assertThat(param.getInt("generator")).isEqualTo(1);
        assertThat(param.getStr("requestId")).isEqualTo(result.externalMessageId());
        assertThat(param.getJSONObject("toUser").getStr("nickName")).isEqualTo("小明");
        assertThat(param.getJSONObject("toUser").getInt("role")).isEqualTo(1);
        assertThat(param.getJSONObject("fromUser").getStr("nickName")).isEqualTo("旗舰店");
        assertThat(param.getJSONObject("fromUser").getInt("role")).isEqualTo(2);
        assertThat(param.getJSONArray("messageList").size()).isEqualTo(1);
        JSONObject message = param.getJSONArray("messageList").getJSONObject(0);
        assertThat(message.getInt("contentType")).isEqualTo(1);
        assertThat(JSONUtil.parseObj(message.getStr("content")).getStr("text")).isEqualTo("在的，稍等");
    }

    @Test
    void reportsChannelRejectionWithOriginalError() {
        handle(200, "{\"result\":0,\"error_msg\":\"invalid sign\"}");

        ChannelSendResult result = sender("小明").send(account(), "buyer-open-1", "hi");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("0").contains("invalid sign");
    }

    @Test
    void failsHonestlyOnMissingCredentialsOrVisitorName() {
        // 缺 signSecret / accessToken：凭据缺口如实说明，不出网
        CompanyChannelDO withoutSign = account();
        withoutSign.getChannelInfo().remove("signSecret");
        assertThat(sender("小明").send(withoutSign, "buyer-open-1", "hi").failureReason()).contains("signSecret");
        CompanyChannelDO withoutToken = account();
        withoutToken.getChannelInfo().remove("accessToken");
        assertThat(sender("小明").send(withoutToken, "buyer-open-1", "hi").failureReason()).contains("accessToken");
        assertThat(requestLines).isEmpty();

        // 买家名称未知（toUser 按 nickName 寻址，无法定位买家）：如实失败不出网
        assertThat(sender(null).send(account(), "buyer-open-1", "hi").failureReason())
            .contains("缺少可回复的来信");
        assertThat(requestLines).isEmpty();
    }

    // ---- 夹具 ----

    private KuaishouTextSender sender(String visitorName) {
        return new KuaishouTextSender(RestClient.builder(), baseUrl, (channelId, userId) -> visitorName);
    }

    private CompanyChannelDO account() {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(9301L);
        account.setChannel(ChannelEnum.KUAISHOU);
        account.setAccountName("旗舰店");
        account.setChannelInfo(new LinkedHashMap<>(Map.of(
            "appKey", "ks696650570360602063",
            "signSecret", SIGN_SECRET,
            "accessToken", "KwaiAccessTokenSample")));
        return account;
    }

    // 官方 SDK 算法独立重算（§4.3 sortAndJoin + sign 后缀）：key 字典序 k=v& 拼接，
    // 末尾追加 &signSecret=<secret> 取 MD5 小写 hex
    private String expectedSign(Map<String, String> values) {
        StringBuilder joined = new StringBuilder();
        for (Map.Entry<String, String> entry : new TreeMap<>(values).entrySet()) {
            if (joined.length() > 0) {
                joined.append('&');
            }
            joined.append(entry.getKey()).append('=').append(entry.getValue());
        }
        joined.append("&signSecret=").append(SIGN_SECRET);
        try {
            return HexFormat.of().formatHex(
                MessageDigest.getInstance("MD5").digest(joined.toString().getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private Map<String, String> withoutSign(Map<String, String> form) {
        Map<String, String> values = new LinkedHashMap<>(form);
        values.remove("sign");
        return values;
    }

    private void handle(int status, String response) {
        server.createContext("/open/cs/intelligent/message/send", exchange -> {
            requestLines.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
            Map<String, String> form = new LinkedHashMap<>();
            for (String pair : new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8).split("&")) {
                int eq = pair.indexOf('=');
                form.put(URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8),
                    URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8));
            }
            forms.add(form);
            byte[] body = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(status, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
    }
}
