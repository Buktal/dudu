package com.dudu.duduserver.channel.douyin;

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
 * 抖音 refreshToken 续期验收（事实见 docs/research/channels/douyin.md §9.6）：
 * POST /oauth/renew_refresh_token/ form 仅 client_key 与 refresh_token 两参，
 * 成功信封取官方示例逐字（顶层 data + message，data.refresh_token 即新值）；
 * 错误全以 HTTP 200 返回且 error_code 在 data 内，10004/10010/10020 附人工
 * 处置建议；轮换产物必须条件回写（旧值即失效，回写未生效即放弃本次新值）；
 * 缺 refreshToken 不出网。
 */
class DouyinRefreshTokenRenewerTest {

    private static final String PATH_RENEW = "/oauth/renew_refresh_token/";

    // §9.6 成功响应逐字（expires_in 官方示例即字符串，不作节奏依据）
    private static final String RENEW_OK = """
        {"data":{"description":"","error_code":0,"expires_in":"86400","refresh_token":"rft.next9f2b"},"message":"success"}
        """;

    // §9.6 异常示例逐字（10004，额外含 captcha/desc_url 字段）
    private static final String RENEW_SCOPE_REJECTED =
        "{\"data\":{\"captcha\":\"\",\"desc_url\":\"\",\"description\":\"scope权限非法\",\"error_code\":10004},\"message\":\"error\"}";
    private static final String RENEW_EXPIRED =
        "{\"data\":{\"description\":\"refresh_token过期\",\"error_code\":10010},\"message\":\"error\"}";
    private static final String RENEW_EXHAUSTED =
        "{\"data\":{\"description\":\"超过刷新次数限制\",\"error_code\":10020},\"message\":\"error\"}";

    // 黄金响应轮换出的新值（与 store 回写断言同源）
    private static final String NEXT_REFRESH_TOKEN = "rft.next9f2b";

    private final CopyOnWriteArrayList<String> requestBodies = new CopyOnWriteArrayList<>();
    private final CopyOnWriteArrayList<Map.Entry<Long, String[]>> stored = new CopyOnWriteArrayList<>();
    private final List<Long> storedAt = new CopyOnWriteArrayList<>();
    private HttpServer server;
    private String baseUrl;
    private com.sun.net.httpserver.HttpContext context;

    // 捕获回写参数的 store 替身（[channelId, 旧值, 新值]，落库时刻取自 renewedAt）
    private final DouyinRefreshTokenStore capturingStore = (channelId, expected, next, renewedAtMillis) -> {
        stored.add(Map.entry(channelId, new String[] {expected, next}));
        storedAt.add(renewedAtMillis);
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
    void renewsTokenAndStoresRotationConditionally() {
        handle(200, RENEW_OK.trim());

        DouyinRefreshTokenRenewer.RenewResult result = client().renew(account(), credentials("used-refresh-token"));

        assertThat(result.succeeded()).isTrue();
        assertThat(result.refreshToken()).isEqualTo(NEXT_REFRESH_TOKEN);

        // form 恰两参（§9.6 官方 curl 逐字）：无 client_secret、无 grant_type、无 access-token 头
        assertThat(requestBodies).hasSize(1);
        Map<String, String> form = new LinkedHashMap<>();
        for (String pair : requestBodies.get(0).split("&")) {
            String[] entry = pair.split("=", 2);
            form.put(entry[0], entry.length > 1 ? entry[1] : "");
        }
        assertThat(form).containsOnlyKeys("client_key", "refresh_token");
        assertThat(form.get("client_key")).isEqualTo("tt10abc");
        assertThat(form.get("refresh_token")).isEqualTo("used-refresh-token");

        // 轮换产物条件回写：旧值送审、新值落库、续期时刻为当下
        assertThat(stored).hasSize(1);
        assertThat(stored.get(0).getKey()).isEqualTo(9301L);
        assertThat(stored.get(0).getValue()).containsExactly("used-refresh-token", NEXT_REFRESH_TOKEN);
        assertThat(storedAt.get(0)).isPositive();
    }

    @Test
    void reportsErrorCodeWithManualAdviceWithoutStoring() {
        for (String rejection : List.of(RENEW_SCOPE_REJECTED, RENEW_EXPIRED, RENEW_EXHAUSTED)) {
            handle(200, rejection);
            DouyinRefreshTokenRenewer.RenewResult result = client().renew(account(), credentials("used-refresh-token"));
            assertThat(result.succeeded()).as(rejection).isFalse();
            assertThat(stored).as(rejection).isEmpty();
        }

        // 10004：错误码与官方 description 原样 + 权限申请建议（§9.6 错误码表）
        handle(200, RENEW_SCOPE_REJECTED);
        var scope = client().renew(account(), credentials("used-refresh-token"));
        assertThat(scope.failureReason()).contains("10004").contains("scope权限非法")
            .contains("renew_refresh_token 权限");

        // 10010：过期建议重新授权录入
        handle(200, RENEW_EXPIRED);
        var expired = client().renew(account(), credentials("used-refresh-token"));
        assertThat(expired.failureReason()).contains("10010").contains("重新授权");

        // 10020：次数用尽建议重新授权录入
        handle(200, RENEW_EXHAUSTED);
        var exhausted = client().renew(account(), credentials("used-refresh-token"));
        assertThat(exhausted.failureReason()).contains("10020").contains("重新授权");
    }

    @Test
    void failsHonestlyWhenEnvelopeMissesRefreshToken() {
        // 信封成功但 data 缺新 refresh_token：如实失败，不回写
        handle(200, "{\"data\":{\"description\":\"\",\"error_code\":0},\"message\":\"success\"}");

        DouyinRefreshTokenRenewer.RenewResult result = client().renew(account(), credentials("used-refresh-token"));

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("缺少新 refresh_token");
        assertThat(stored).isEmpty();
    }

    @Test
    void abandonsRotationWhenStoreConditionMisses() {
        // 回写条件未命中：库内旧值已被并发续期或重新录入改写，本次新值放弃
        handle(200, RENEW_OK.trim());
        DouyinRefreshTokenRenewer conditionMissed = new DouyinRefreshTokenRenewer(
            RestClient.builder(), baseUrl, (channelId, expected, next, renewedAtMillis) -> false);

        DouyinRefreshTokenRenewer.RenewResult result = conditionMissed.renew(account(), credentials("used-refresh-token"));

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("已变化").contains("放弃");
    }

    @Test
    void failsBeforeRequestWhenRefreshTokenMissing() {
        DouyinRefreshTokenRenewer.RenewResult result = client().renew(account(), credentials(null));

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("refreshToken");
        assertThat(requestBodies).isEmpty();
    }

    // ---- 夹具 ----

    private DouyinRefreshTokenRenewer client() {
        return new DouyinRefreshTokenRenewer(RestClient.builder(), baseUrl, capturingStore);
    }

    private CompanyChannelDO account() {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(9301L);
        account.setChannel(ChannelEnum.DOUYIN);
        return account;
    }

    private DouyinCredentials credentials(String refreshToken) {
        return new DouyinCredentials("tt10abc", "client-secret-not-sent", refreshToken);
    }

    private void handle(int status, String response) {
        // 同路径重复注册时旧 context 仍先匹配：持有引用先删后建，保证最新响应生效
        if (context != null) {
            server.removeContext(context);
        }
        context = server.createContext(PATH_RENEW, exchange -> {
            requestBodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] body = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(status, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
    }
}
