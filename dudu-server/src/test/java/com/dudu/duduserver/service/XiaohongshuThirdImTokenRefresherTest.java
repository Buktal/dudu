package com.dudu.duduserver.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.dudu.duduserver.channel.xiaohongshuthirdim.XiaohongshuThirdImTokenClient;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.service.impl.XiaohongshuThirdImTokenRefresher;
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
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 小红书私信三方令牌轮换 job 验收：遍历全部三方私信账号，已授权账号走刷新接口并
 * 持久化轮换产物（docs/research/channels/xiaohongshu.md §13.4），未完成授权的账号
 * 跳过不出网；单个账号刷新失败（渠道拒绝或网络异常）留痕后继续处理其余账号。
 */
class XiaohongshuThirdImTokenRefresherTest {

    // §13.4 黄金信封的最小可用形态：code=0 + 轮换双 token
    private static final String REFRESH_OK = """
        {"code":0,"success":true,"msg":"成功","data":{
        "access_token":"new-access-token","access_token_expires_in":86399,
        "refresh_token":"next-refresh-token","refresh_token_expires_in":2591999}}
        """;
    private static final String REFRESH_REJECTED =
        "{\"code\":40001,\"success\":false,\"msg\":\"invalid refresh_token\"}";

    private final AtomicInteger refreshCalls = new AtomicInteger();
    private final CopyOnWriteArrayList<Map.Entry<Long, String[]>> stored = new CopyOnWriteArrayList<>();
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
    void refreshesAuthorizedAccountsAndSkipsUnauthorizedOnes() {
        handle(200, REFRESH_OK.trim());
        when(accounts.list(any(Wrapper.class))).thenReturn(List.of(
            account(9401L, true), account(9402L, false)));

        refresher().refreshAll();

        // 未完成授权（缺 refreshToken）的账号跳过：只有已授权账号出网
        assertThat(refreshCalls.get()).isEqualTo(1);
        assertThat(stored).hasSize(1);
        assertThat(stored.get(0).getKey()).isEqualTo(9401L);
        assertThat(stored.get(0).getValue()).containsExactly("new-access-token", "next-refresh-token");
    }

    @Test
    void continuesWithRemainingAccountsWhenOneRefreshFails() {
        // 两个已授权账号：第一个渠道拒绝、第二个成功，失败不中断后续轮换
        handle(200, REFRESH_REJECTED);
        when(accounts.list(any(Wrapper.class))).thenReturn(List.of(
            account(9401L, true), account(9402L, true)));

        refresher().refreshAll();

        assertThat(refreshCalls.get()).isEqualTo(2);
        assertThat(stored).isEmpty();

        // 失败账号重试路径复用同一客户端：换成功响应后可再次轮换
        handle(200, REFRESH_OK.trim());
        when(accounts.list(any(Wrapper.class))).thenReturn(List.of(account(9401L, true)));
        refresher().refreshAll();
        assertThat(stored).hasSize(1);
        assertThat(stored.get(0).getKey()).isEqualTo(9401L);
    }

    // ---- 夹具 ----

    private XiaohongshuThirdImTokenRefresher refresher() {
        XiaohongshuThirdImTokenClient tokenClient = new XiaohongshuThirdImTokenClient(
            RestClient.builder(), "http://127.0.0.1:" + server.getAddress().getPort(),
            (channelId, accessToken, refreshToken) ->
                stored.add(Map.entry(channelId, new String[] {accessToken, refreshToken})));
        return new XiaohongshuThirdImTokenRefresher(accounts, tokenClient);
    }

    // authorized=false 时绑定骨架在但缺 refreshToken（未完成授权）
    private CompanyChannelDO account(Long companyChannelId, boolean authorized) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(companyChannelId);
        account.setChannel(ChannelEnum.XIAOHONGSHU_THIRD_IM);
        Map<String, Object> info = new java.util.HashMap<>();
        info.put("appId", "234");
        info.put("secret", "1234abc");
        if (authorized) {
            info.put("refreshToken", "used-refresh-token-" + companyChannelId);
        }
        account.setChannelInfo(info);
        return account;
    }

    // 同一端点重复注册时旧 context 仍先匹配：持有引用先删后建，保证最新响应生效
    private void handle(int status, String response) {
        if (refreshContext != null) {
            server.removeContext(refreshContext);
        }
        refreshContext = server.createContext("/api/open/oauth2/refresh_token", exchange -> {
            refreshCalls.incrementAndGet();
            byte[] body = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(status, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
    }
}
