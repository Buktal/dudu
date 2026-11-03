package com.dudu.duduserver.channel.xiaohongshuthirdim;

import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.support.TokenResult;
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
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 小红书私信三方令牌刷新验收（事实见 docs/research/channels/xiaohongshu.md §13.4，
 * 4808/4945）：POST /api/open/oauth2/refresh_token JSON body {app_id(long)、secret、
 * refresh_token}，成功信封取 4945 黄金示例逐字（code=0 + data 轮换双 token 与有效期
 * 字段全集）；每次刷新轮换双 token，轮换产物必须回写 channel_info（旧 token 5 分钟
 * 失效，不落库则重启后失去续期能力）；渠道拒绝原样记录 code 与 msg，缺 refreshToken
 * 或 app_id 非数值不出网。
 */
class XiaohongshuThirdImTokenClientTest {

    // 4945 黄金响应逐字（信封与 data 字段全集；refresh 语境同构复用）
    private static final String REFRESH_OK = """
        {"code":0,"success":true,"msg":"成功","data":{"user_id":"5c8650cb0000000001004367",
        "role_type":3,"approval_advertisers":[{"advertiser_id":1234,"advertiser_name":"品牌测试账号222"}],
        "refresh_token":"5be1789576f45f90ccfbf4ba16ca4a5b","advertiser_id":1234,
        "refresh_token_expires_in":2591999,"approval_role_type":4,"platform_type":1,
        "access_token":"0cde2287cd0dedcf472ceb266d0710ba","access_token_expires_in":86399}}
        """;

    // 黄金响应轮换出的新双 token（与 store 回写断言同源）
    private static final String NEW_ACCESS_TOKEN = "0cde2287cd0dedcf472ceb266d0710ba";
    private static final String NEXT_REFRESH_TOKEN = "5be1789576f45f90ccfbf4ba16ca4a5b";

    private final CopyOnWriteArrayList<String> requestBodies = new CopyOnWriteArrayList<>();
    private final CopyOnWriteArrayList<Map.Entry<Long, String[]>> stored = new CopyOnWriteArrayList<>();
    private HttpServer server;
    private String baseUrl;
    private com.sun.net.httpserver.HttpContext refreshContext;

    // 捕获回写参数的 store 替身（[channelId, accessToken, refreshToken]）
    private final XiaohongshuThirdImTokenStore capturingStore = (channelId, accessToken, refreshToken) ->
        stored.add(Map.entry(channelId, new String[] {accessToken, refreshToken}));

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
    void refreshesTokenAndPersistsRotatedPair() {
        handle(200, REFRESH_OK.trim());

        TokenResult result = client().refresh(account(), accountCredentials());

        assertThat(result.succeeded()).isTrue();
        assertThat(result.accessToken()).isEqualTo(NEW_ACCESS_TOKEN);

        // 请求 body 逐字段（§13.4：app_id 为 long 数值形态，非字符串）
        assertThat(requestBodies).hasSize(1);
        var body = JSONUtil.parseObj(requestBodies.get(0));
        assertThat(body.getLong("app_id")).isEqualTo(234L);
        assertThat(body.getStr("secret")).isEqualTo("1234abc");
        assertThat(body.getStr("refresh_token")).isEqualTo("used-refresh-token");

        // 轮换产物先持久化再返回：新双 token 回写 channel_info
        assertThat(stored).hasSize(1);
        assertThat(stored.get(0).getKey()).isEqualTo(9401L);
        assertThat(stored.get(0).getValue()).containsExactly(NEW_ACCESS_TOKEN, NEXT_REFRESH_TOKEN);
    }

    @Test
    void reportsChannelRejectionWithoutStoring() {
        handle(200, "{\"code\":40001,\"success\":false,\"msg\":\"invalid refresh_token\"}");

        TokenResult result = client().refresh(account(), accountCredentials());

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("40001").contains("invalid refresh_token");
        assertThat(stored).isEmpty();
    }

    @Test
    void failsHonestlyWhenRotationPairMissingOrStoreRejects() {
        // 信封成功但 data 缺轮换 refresh_token：如实失败，不回写半对 token
        handle(200, "{\"code\":0,\"success\":true,\"msg\":\"成功\",\"data\":{\"access_token\":\"only-access\"}}");
        TokenResult missing = client().refresh(account(), accountCredentials());
        assertThat(missing.succeeded()).isFalse();
        assertThat(missing.failureReason()).contains("缺少轮换 token");
        assertThat(stored).isEmpty();

        // 回写失败按调用失败处理：新 token 未落库即不可靠（换成功信封走通轮换再让 store 拒绝）
        handle(200, REFRESH_OK.trim());
        XiaohongshuThirdImTokenClient failingStore = new XiaohongshuThirdImTokenClient(
            RestClient.builder(), baseUrl, (channelId, accessToken, refreshToken) -> {
            throw new IllegalStateException("db down");
        });
        TokenResult storeFailed = failingStore.refresh(account(), accountCredentials());
        assertThat(storeFailed.succeeded()).isFalse();
        assertThat(storeFailed.failureReason()).contains("db down");
    }

    @Test
    void failsBeforeRequestWhenRefreshTokenMissingOrAppIdNotNumeric() {
        TokenResult noRefreshToken = client().refresh(account(), credentials("234", "1234abc", null));
        assertThat(noRefreshToken.succeeded()).isFalse();
        assertThat(noRefreshToken.failureReason()).contains("refreshToken");
        assertThat(requestBodies).isEmpty();

        TokenResult badAppId = client().refresh(account(), credentials("not-a-number", "1234abc", "used-refresh-token"));
        assertThat(badAppId.succeeded()).isFalse();
        assertThat(badAppId.failureReason()).contains("app_id");
        assertThat(requestBodies).isEmpty();
    }

    // ---- 夹具 ----

    private XiaohongshuThirdImTokenClient client() {
        return new XiaohongshuThirdImTokenClient(RestClient.builder(), baseUrl, capturingStore);
    }

    private CompanyChannelDO account() {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(9401L);
        account.setChannel(ChannelEnum.XIAOHONGSHU_THIRD_IM);
        return account;
    }

    private XiaohongshuThirdImCredentials accountCredentials() {
        return credentials("234", "1234abc", "used-refresh-token");
    }

    private XiaohongshuThirdImCredentials credentials(String appId, String secret, String refreshToken) {
        return new XiaohongshuThirdImCredentials(appId, secret, "stale-access-token", refreshToken);
    }

    private void handle(int status, String response) {
        // 同路径重复注册时旧 context 仍先匹配：持有引用先删后建，保证最新响应生效
        if (refreshContext != null) {
            server.removeContext(refreshContext);
        }
        refreshContext = server.createContext("/api/open/oauth2/refresh_token", exchange -> {
            requestBodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] body = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(status, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
    }
}
