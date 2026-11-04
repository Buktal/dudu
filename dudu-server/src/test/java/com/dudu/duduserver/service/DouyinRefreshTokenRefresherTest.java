package com.dudu.duduserver.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.dudu.duduserver.channel.douyin.DouyinRefreshTokenRenewer;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.service.impl.DouyinRefreshTokenRefresher;
import com.sun.net.httpserver.HttpServer;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 抖音 refreshToken 续期 job 验收（docs/research/channels/douyin.md §9.6）：每天
 * 巡检抖音账号，距上次续期（channel_info 的 refreshTokenRenewedAt，无记录时以
 * 账号最后修改时刻近似首录时刻）满 25 天才续期，未到期不出网；未完成授权的账号
 * 跳过；单个账号续期失败（如 10004 未申请权限）留痕后继续处理其余账号。
 */
class DouyinRefreshTokenRefresherTest {

    private static final long DAY_MILLIS = 24L * 60 * 60 * 1000;

    // §9.6 成功响应最小形态：error_code=0 + 新 refresh_token
    private static final String RENEW_OK =
        "{\"data\":{\"description\":\"\",\"error_code\":0,\"refresh_token\":\"rft.next\"},\"message\":\"success\"}";
    private static final String RENEW_SCOPE_REJECTED =
        "{\"data\":{\"description\":\"scope权限非法\",\"error_code\":10004},\"message\":\"error\"}";

    private final AtomicInteger renewCalls = new AtomicInteger();
    private final CopyOnWriteArrayList<Long> renewedAccounts = new CopyOnWriteArrayList<>();
    private final CompanyChannelService accounts = mock(CompanyChannelService.class);
    private HttpServer server;
    private com.sun.net.httpserver.HttpContext renewContext;

    @BeforeAll
    static void registerTableInfo() {
        // job 内的 LambdaQueryWrapper 需要实体 TableInfo 缓存，无 DB 环境下手动注册
        TableInfoHelper.initTableInfo(
            new MapperBuilderAssistant(new MybatisConfiguration(), ""), CompanyChannelDO.class);
    }

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.start();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void renewsOnlyAccountsDueForRenewal() {
        handle(RENEW_OK);
        when(accounts.list(any(Wrapper.class))).thenReturn(List.of(
            dueByRenewedAt(9301L, System.currentTimeMillis() - 26 * DAY_MILLIS),
            dueByRenewedAt(9302L, System.currentTimeMillis() - 10 * DAY_MILLIS),
            dueByUpdateTime(9303L, System.currentTimeMillis() - 26 * DAY_MILLIS),
            dueByUpdateTime(9304L, System.currentTimeMillis() - DAY_MILLIS)));

        refresher().renewAll();

        // 25 天节奏：renewedAt 满 25 天与首录（无 renewedAt 按 updateTime 起算）满 25 天
        // 的账号续期，未到期账号不出网
        assertThat(renewCalls.get()).isEqualTo(2);
        assertThat(renewedAccounts).containsExactly(9301L, 9303L);
    }

    @Test
    void skipsUnauthorizedAccounts() {
        handle(RENEW_OK);
        Map<String, Object> info = new HashMap<>();
        info.put("clientKey", "tt10abc");
        info.put("clientSecret", "s");
        // 有 renewedAt 且到期，但缺 refreshToken：未完成用户授权
        info.put("refreshTokenRenewedAt", System.currentTimeMillis() - 26 * DAY_MILLIS);
        CompanyChannelDO unauthorized = account(9305L, info, null);
        when(accounts.list(any(Wrapper.class))).thenReturn(List.of(unauthorized));

        refresher().renewAll();

        assertThat(renewCalls.get()).isZero();
        assertThat(renewedAccounts).isEmpty();
    }

    @Test
    void continuesWithRemainingAccountsWhenOneRenewFails() {
        // 两个到期账号：第一个 10004 渠道拒绝、第二个成功，失败不中断后续续期
        handle(RENEW_SCOPE_REJECTED, RENEW_OK);
        long due = System.currentTimeMillis() - 26 * DAY_MILLIS;
        when(accounts.list(any(Wrapper.class))).thenReturn(List.of(
            dueByRenewedAt(9306L, due), dueByRenewedAt(9307L, due)));

        refresher().renewAll();

        assertThat(renewCalls.get()).isEqualTo(2);
        assertThat(renewedAccounts).containsExactly(9307L);
    }

    // ---- 夹具 ----

    private DouyinRefreshTokenRefresher refresher() {
        DouyinRefreshTokenRenewer renewer = new DouyinRefreshTokenRenewer(
            RestClient.builder(), "http://127.0.0.1:" + server.getAddress().getPort(),
            (channelId, expected, next, renewedAtMillis) -> {
                renewedAccounts.add(channelId);
                return true;
            });
        return new DouyinRefreshTokenRefresher(accounts, renewer);
    }

    private CompanyChannelDO dueByRenewedAt(Long companyChannelId, long renewedAtMillis) {
        Map<String, Object> info = new HashMap<>();
        info.put("clientKey", "tt10abc");
        info.put("clientSecret", "s");
        info.put("refreshToken", "used-" + companyChannelId);
        info.put("refreshTokenRenewedAt", renewedAtMillis);
        return account(companyChannelId, info, null);
    }

    private CompanyChannelDO dueByUpdateTime(Long companyChannelId, long updateTimeMillis) {
        Map<String, Object> info = new HashMap<>();
        info.put("clientKey", "tt10abc");
        info.put("clientSecret", "s");
        info.put("refreshToken", "used-" + companyChannelId);
        return account(companyChannelId, info, LocalDateTime
            .ofInstant(Instant.ofEpochMilli(updateTimeMillis), ZoneId.systemDefault()));
    }

    private CompanyChannelDO account(Long companyChannelId, Map<String, Object> info,
        LocalDateTime updateTime) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(companyChannelId);
        account.setChannel(ChannelEnum.DOUYIN);
        account.setChannelInfo(info);
        account.setUpdateTime(updateTime);
        return account;
    }

    // 同一端点重复注册时旧 context 仍先匹配：持有引用先删后建，保证最新响应生效
    private void handle(String... responses) {
        if (renewContext != null) {
            server.removeContext(renewContext);
        }
        renewContext = server.createContext("/oauth/renew_refresh_token/", exchange -> {
            // 第 i 次请求取第 i 个响应，超出后重复最后一个（失败续跑场景）
            int call = renewCalls.incrementAndGet() - 1;
            String response = responses[Math.min(call, responses.length - 1)];
            byte[] body = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            // §9.6：错误码全以 HTTP 200 返回，替身状态码固定 200
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
    }
}
