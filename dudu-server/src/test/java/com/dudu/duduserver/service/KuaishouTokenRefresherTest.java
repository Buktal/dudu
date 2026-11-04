package com.dudu.duduserver.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.dudu.duduserver.channel.kuaishou.KuaishouOAuthClient;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.service.impl.KuaishouTokenRefresher;
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
 * 快手 accessToken 刷新 job 验收（docs/research/channels/kuaishou.md §8）：每 12
 * 小时巡检快手账号，距上次刷新（channel_info 的 refreshTokenRenewedAt）满 20 小时
 * 才刷新（24h 寿命留 4h 缓冲），未到期不出网；无刷新时刻即新授权链（手录
 * refreshToken 或重新授权清除旧时刻），立即首刷——accessToken 落库直读的发送链路
 * 不空等；未完成授权的账号跳过；单个账号刷新失败（如 803000 令牌过期）留痕后继续
 * 处理其余账号。
 */
class KuaishouTokenRefresherTest {

    private static final long HOUR_MILLIS = 60L * 60 * 1000;

    // §8 响应字段表构造的成功信封最小形态：result=1 + 双 token
    private static final String REFRESH_OK =
        "{\"result\":1,\"access_token\":\"at.next\",\"refresh_token\":\"rft.next\",\"expires_in\":86400}";
    private static final String REFRESH_TOKEN_EXPIRED =
        "{\"result\":1000,\"error\":\"803000\",\"error_msg\":\"access token expired\"}";

    private final AtomicInteger refreshCalls = new AtomicInteger();
    private final CopyOnWriteArrayList<Long> refreshedAccounts = new CopyOnWriteArrayList<>();
    private final CompanyChannelService accounts = mock(CompanyChannelService.class);
    private HttpServer server;
    private com.sun.net.httpserver.HttpContext refreshContext;

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
    void refreshesOnlyAccountsDueForRefresh() {
        handle(REFRESH_OK);
        when(accounts.list(any(Wrapper.class))).thenReturn(List.of(
            dueByRenewedAt(9301L, System.currentTimeMillis() - 21 * HOUR_MILLIS),
            dueByRenewedAt(9302L, System.currentTimeMillis() - 10 * HOUR_MILLIS),
            freshChain(9303L)));

        refresher().refreshAll();

        // 20h 节奏：renewedAt 满 20h 的账号刷新，未到期账号不出网；无刷新时刻即
        // 新授权链，立即首刷（accessToken 尚不在库，发送链路依赖首刷产出）
        assertThat(refreshCalls.get()).isEqualTo(2);
        assertThat(refreshedAccounts).containsExactly(9301L, 9303L);
    }

    @Test
    void skipsUnauthorizedAccounts() {
        handle(REFRESH_OK);
        Map<String, Object> info = new HashMap<>();
        info.put("appKey", "ks7001");
        info.put("appSecret", "as");
        // 有 renewedAt 且到期，但缺 refreshToken：未完成商家授权
        info.put("refreshTokenRenewedAt", System.currentTimeMillis() - 21 * HOUR_MILLIS);
        CompanyChannelDO unauthorized = account(9305L, info);
        when(accounts.list(any(Wrapper.class))).thenReturn(List.of(unauthorized));

        refresher().refreshAll();

        assertThat(refreshCalls.get()).isZero();
        assertThat(refreshedAccounts).isEmpty();
    }

    @Test
    void continuesWithRemainingAccountsWhenOneRefreshFails() {
        // 两个到期账号：第一个 803000 令牌过期、第二个成功，失败不中断后续刷新
        handle(REFRESH_TOKEN_EXPIRED, REFRESH_OK);
        long due = System.currentTimeMillis() - 21 * HOUR_MILLIS;
        when(accounts.list(any(Wrapper.class))).thenReturn(List.of(
            dueByRenewedAt(9306L, due), dueByRenewedAt(9307L, due)));

        refresher().refreshAll();

        assertThat(refreshCalls.get()).isEqualTo(2);
        assertThat(refreshedAccounts).containsExactly(9307L);
    }

    // ---- 夹具 ----

    private KuaishouTokenRefresher refresher() {
        KuaishouOAuthClient oauth = new KuaishouOAuthClient(
            RestClient.builder(), "http://127.0.0.1:" + server.getAddress().getPort(),
            (channelId, expected, newAccessToken, newRefreshToken, refreshedAtMillis) -> {
                refreshedAccounts.add(channelId);
                return true;
            });
        return new KuaishouTokenRefresher(accounts, oauth);
    }

    private CompanyChannelDO dueByRenewedAt(Long companyChannelId, long renewedAtMillis) {
        Map<String, Object> info = new HashMap<>();
        info.put("appKey", "ks7001");
        info.put("appSecret", "as");
        info.put("refreshToken", "used-" + companyChannelId);
        info.put("refreshTokenRenewedAt", renewedAtMillis);
        return account(companyChannelId, info);
    }

    // 新授权链：有 refreshToken 无刷新时刻（手录或重新授权后清除），立即首刷
    private CompanyChannelDO freshChain(Long companyChannelId) {
        Map<String, Object> info = new HashMap<>();
        info.put("appKey", "ks7001");
        info.put("appSecret", "as");
        info.put("refreshToken", "used-" + companyChannelId);
        return account(companyChannelId, info);
    }

    private CompanyChannelDO account(Long companyChannelId, Map<String, Object> info) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(companyChannelId);
        account.setChannel(ChannelEnum.KUAISHOU);
        account.setChannelInfo(info);
        return account;
    }

    // 同一端点重复注册时旧 context 仍先匹配：持有引用先删后建，保证最新响应生效
    private void handle(String... responses) {
        if (refreshContext != null) {
            server.removeContext(refreshContext);
        }
        refreshContext = server.createContext("/oauth2/refresh_token", exchange -> {
            // 第 i 次请求取第 i 个响应，超出后重复最后一个（失败续跑场景）
            int call = refreshCalls.incrementAndGet() - 1;
            String response = responses[Math.min(call, responses.length - 1)];
            byte[] body = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
    }
}
