package com.dudu.duduserver.channel.kuaishou;

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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 快手 oauth2 客户端验收（事实见 docs/research/channels/kuaishou.md §8，官方 SDK
 * jar 反编译实锤）：GET /oauth2/access_token 与 /oauth2/refresh_token，query 恰四
 * 参（app_id、app_secret、grant_type、code 或 refresh_token），无网关签名；成功
 * 信封 result=1 顶层平铺取双 token；失败 result≠1 携 error/error_msg，803000/803001
 * （error 字段的网关族令牌过期码）附重新授权建议；刷新轮换产物必须条件回写（旧值
 * 随轮换失效，回写未生效即放弃本次新值）；缺 refreshToken 不出网。
 */
class KuaishouOAuthClientTest {

    private static final String PATH_ACCESS_TOKEN = "/oauth2/access_token";
    private static final String PATH_REFRESH_TOKEN = "/oauth2/refresh_token";

    // §8 响应字段表构造的成功信封（expires_in 默认 86400s，refresh_token_expires_in
    // 无公开数值取位）
    private static final String REFRESH_OK = """
        {"result":1,"error":null,"error_msg":"SUCCESS","access_token":"at.next5f21",\
        "refresh_token":"rft.next3a97","open_id":"buyer-open-1","expires_in":86400,\
        "refresh_token_expires_in":169158,"scopes":["/open/cs/intelligent/message/send"]}
        """;

    // 令牌过期拒绝（error 字段携网关族错误码 803000）
    private static final String REFRESH_TOKEN_EXPIRED =
        "{\"result\":1000,\"error\":\"803000\",\"error_msg\":\"access token expired\"}";
    private static final String REFRESH_REJECTED =
        "{\"result\":1000,\"error\":\"invalid refresh token\",\"error_msg\":\"刷新凭证非法\"}";

    private final CopyOnWriteArrayList<String> requestQueries = new CopyOnWriteArrayList<>();
    private final CopyOnWriteArrayList<Map.Entry<Long, String[]>> stored = new CopyOnWriteArrayList<>();
    private final List<Long> storedAt = new CopyOnWriteArrayList<>();
    private HttpServer server;
    private String baseUrl;
    private com.sun.net.httpserver.HttpContext context;

    // 捕获回写参数的 store 替身（[channelId, 旧 refreshToken, 新 accessToken, 新
    // refreshToken]，落库时刻取自 refreshedAt）
    private final KuaishouTokenStore capturingStore =
        (channelId, expected, newAccessToken, newRefreshToken, refreshedAtMillis) -> {
            stored.add(Map.entry(channelId, new String[] {expected, newAccessToken, newRefreshToken}));
            storedAt.add(refreshedAtMillis);
            return true;
        };

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
    void exchangesAuthCodeForFirstTokensWithoutStoring() {
        handle(PATH_ACCESS_TOKEN, 200, REFRESH_OK.trim());

        KuaishouOAuthClient.ExchangeResult result =
            client().exchange("ks7001234567890123", "app-secret", "auth-code-5f21");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.accessToken()).isEqualTo("at.next5f21");
        assertThat(result.refreshToken()).isEqualTo("rft.next3a97");

        // query 恰四参（§8 buildOauthAccessTokenRequest 逐字）：grant_type=code
        Map<String, String> query = queryOf();
        assertThat(query).containsOnlyKeys("app_id", "app_secret", "grant_type", "code");
        assertThat(query.get("app_id")).isEqualTo("ks7001234567890123");
        assertThat(query.get("app_secret")).isEqualTo("app-secret");
        assertThat(query.get("grant_type")).isEqualTo("code");
        assertThat(query.get("code")).isEqualTo("auth-code-5f21");

        // 首换产物不经 store 回写：调用发生在账号保存链路，由调用方持有写入权
        assertThat(stored).isEmpty();
    }

    @Test
    void exchangeReportsRejectionWithAdvice() {
        handle(PATH_ACCESS_TOKEN, 200, REFRESH_TOKEN_EXPIRED);

        KuaishouOAuthClient.ExchangeResult result =
            client().exchange("ks7001234567890123", "app-secret", "used-code");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("1000").contains("803000")
            .contains("access token expired").contains("重新授权");
        assertThat(stored).isEmpty();
    }

    @Test
    void exchangeFailsHonestlyWhenEnvelopeMissesTokens() {
        // result=1 但缺 refresh_token：如实失败，不猜测换取结果
        handle(PATH_ACCESS_TOKEN, 200, "{\"result\":1,\"access_token\":\"at.only\"}");

        KuaishouOAuthClient.ExchangeResult result =
            client().exchange("ks7001234567890123", "app-secret", "auth-code-5f21");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("缺少 access_token 或 refresh_token");
    }

    @Test
    void refreshesTokensAndStoresRotationConditionally() {
        handle(200, REFRESH_OK.trim());

        KuaishouOAuthClient.RefreshResult result = client().refresh(account(), credentials("used-refresh-token"));

        assertThat(result.succeeded()).isTrue();
        assertThat(result.accessToken()).isEqualTo("at.next5f21");
        assertThat(result.refreshToken()).isEqualTo("rft.next3a97");

        // query 恰四参（§8 buildOauthRefreshTokenRequest 逐字）：grant_type=refresh_token
        Map<String, String> query = queryOf();
        assertThat(query).containsOnlyKeys("app_id", "app_secret", "grant_type", "refresh_token");
        assertThat(query.get("app_id")).isEqualTo("ks7001234567890123");
        assertThat(query.get("app_secret")).isEqualTo("app-secret");
        assertThat(query.get("grant_type")).isEqualTo("refresh_token");
        assertThat(query.get("refresh_token")).isEqualTo("used-refresh-token");

        // 轮换产物条件回写：旧值送审、双 token 落库、刷新时刻为当下
        assertThat(stored).hasSize(1);
        assertThat(stored.get(0).getKey()).isEqualTo(9301L);
        assertThat(stored.get(0).getValue())
            .containsExactly("used-refresh-token", "at.next5f21", "rft.next3a97");
        assertThat(storedAt.get(0)).isPositive();
    }

    @Test
    void reportsErrorCodeWithManualAdviceWithoutStoring() {
        for (String rejection : List.of(REFRESH_REJECTED, REFRESH_TOKEN_EXPIRED)) {
            handle(200, rejection);
            KuaishouOAuthClient.RefreshResult result =
                client().refresh(account(), credentials("used-refresh-token"));
            assertThat(result.succeeded()).as(rejection).isFalse();
            assertThat(stored).as(rejection).isEmpty();
        }

        // 普通拒绝：result 与 error/error_msg 原样，无建议
        handle(200, REFRESH_REJECTED);
        var rejected = client().refresh(account(), credentials("used-refresh-token"));
        assertThat(rejected.failureReason()).contains("1000").contains("刷新凭证非法")
            .doesNotContain("重新授权");

        // 803000：error 字段的网关族令牌过期码，附重新授权建议
        handle(200, REFRESH_TOKEN_EXPIRED);
        var expired = client().refresh(account(), credentials("used-refresh-token"));
        assertThat(expired.failureReason()).contains("803000").contains("重新授权");
    }

    @Test
    void failsHonestlyWhenEnvelopeMissesTokens() {
        // result=1 但缺新 refresh_token：如实失败，不回写
        handle(200, "{\"result\":1,\"access_token\":\"at.only\"}");

        KuaishouOAuthClient.RefreshResult result = client().refresh(account(), credentials("used-refresh-token"));

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("缺少 access_token 或 refresh_token");
        assertThat(stored).isEmpty();
    }

    @Test
    void abandonsRotationWhenStoreConditionMisses() {
        // 回写条件未命中：库内旧值已被并发刷新或重新录入改写，本次新值放弃
        handle(200, REFRESH_OK.trim());
        KuaishouOAuthClient conditionMissed = new KuaishouOAuthClient(
            RestClient.builder(), baseUrl,
            (channelId, expected, newAccessToken, newRefreshToken, refreshedAtMillis) -> false);

        KuaishouOAuthClient.RefreshResult result = conditionMissed.refresh(account(), credentials("used-refresh-token"));

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("已变化").contains("放弃");
    }

    @Test
    void failsBeforeRequestWhenRefreshTokenMissing() {
        KuaishouOAuthClient.RefreshResult result = client().refresh(account(), credentials(null));

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("refreshToken");
        assertThat(requestQueries).isEmpty();
    }

    @Test
    void failsBeforeRequestWhenAppSecretMissing() {
        // appSecret 为 Console 非必填字段：缺失即如实失败，不把 null 变字符串上送
        assertThat(client().refresh(account(),
            new KuaishouCredentials("ks7001234567890123", null, "ss", "stale", "used-refresh-token"))
            .failureReason()).contains("appSecret");

        assertThat(client().exchange("ks7001234567890123", null, "auth-code-5f21")
            .failureReason()).contains("appSecret");

        assertThat(requestQueries).isEmpty();
    }

    // ---- 夹具 ----

    private KuaishouOAuthClient client() {
        return new KuaishouOAuthClient(RestClient.builder(), baseUrl, capturingStore);
    }

    private CompanyChannelDO account() {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(9301L);
        account.setChannel(ChannelEnum.KUAISHOU);
        return account;
    }

    private KuaishouCredentials credentials(String refreshToken) {
        return new KuaishouCredentials("ks7001234567890123", "app-secret",
            "sign-secret-not-sent", "stale-access-token", refreshToken);
    }

    // GET query 断言：解析替身捕获的请求 URI query 串
    private Map<String, String> queryOf() {
        assertThat(requestQueries).hasSize(1);
        Map<String, String> query = new LinkedHashMap<>();
        for (String pair : requestQueries.get(0).split("&")) {
            String[] entry = pair.split("=", 2);
            query.put(entry[0], entry.length > 1 ? entry[1] : "");
        }
        return query;
    }

    private void handle(int status, String response) {
        handle(PATH_REFRESH_TOKEN, status, response);
    }

    private void handle(String path, int status, String response) {
        // 同路径重复注册时旧 context 仍先匹配：持有引用先删后建，保证最新响应生效
        if (context != null) {
            server.removeContext(context);
        }
        context = server.createContext(path, exchange -> {
            requestQueries.add(exchange.getRequestURI().getRawQuery());
            byte[] body = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(status, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
    }
}
