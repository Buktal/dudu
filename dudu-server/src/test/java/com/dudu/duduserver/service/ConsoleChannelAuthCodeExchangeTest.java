package com.dudu.duduserver.service;

import com.dudu.duduserver.channel.console.ConsoleCallbackUrls;
import com.dudu.duduserver.channel.console.ConsoleChannelCatalog;
import com.dudu.duduserver.channel.console.ConsoleChannelConfiguration;
import com.dudu.duduserver.channel.douyin.DouyinOAuthClient;
import com.dudu.duduserver.channel.kuaishou.KuaishouOAuthClient;
import com.dudu.duduserver.channel.xiaohongshuthirdim.XiaohongshuThirdImTokenClient;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.dto.ConsoleChannelRequests;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.entity.CompanyDO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.entity.UserGroupDO;
import com.dudu.duduserver.service.impl.ConsoleChannelServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Console 保存授权码首换验收（小红书三方私信 docs/research/channels/xiaohongshu.md
 * §13.4、抖音 docs/research/channels/douyin.md §6、快手 docs/research/channels/
 * kuaishou.md §8）：授权码 10 分钟时效且一次性，保存即同步换取（等定时任务必
 * 失效）；换取成功把轮换产物写入 channel_info 并丢弃授权码，失败整体拒绝促重新
 * 授权，未携带授权码的保存不触发出网；抖音/快手首换同时清除服务端续期时刻（新
 * 授权链按保存时刻起算，不烧轮换配额）
 */
class ConsoleChannelAuthCodeExchangeTest {

    private static final Long ACCOUNT_ID = 9401L;
    private static final Long GROUP_ID = 5L;
    private static final String ORIGIN = "https://console.dudu.local";

    private final ConsoleAccessService accessService = mock(ConsoleAccessService.class);
    private final CompanyChannelService accounts = mock(CompanyChannelService.class);
    private final XiaohongshuThirdImTokenClient thirdImTokens = mock(XiaohongshuThirdImTokenClient.class);
    private final DouyinOAuthClient douyinOAuth = mock(DouyinOAuthClient.class);
    private final KuaishouOAuthClient kuaishouOAuth = mock(KuaishouOAuthClient.class);
    private final ConsoleCallbackUrls callbackUrls = mock(ConsoleCallbackUrls.class);

    private CompanyChannelDO account;
    private ConsoleChannelServiceImpl service;

    @BeforeEach
    void setUp() {
        account = new CompanyChannelDO();
        account.setCompanyChannelId(ACCOUNT_ID);
        account.setCompanyId(77L);
        account.setGroupId(GROUP_ID);
        account.setChannel(ChannelEnum.XIAOHONGSHU_THIRD_IM);
        account.setAccountName("小红书主号");
        account.setChannelInfo(new LinkedHashMap<>(Map.of("appId", "234", "secret", "1234abc")));

        CompanyDO company = new CompanyDO();
        company.setCompanyId(77L);
        UserDO user = new UserDO();
        user.setUserId(9L);
        ConsoleAccess access = new ConsoleAccess(company, user, Set.of(GROUP_ID));
        when(accessService.lock(any())).thenReturn(access);
        UserGroupDO group = new UserGroupDO();
        group.setGroupId(GROUP_ID);
        group.setGroupName("客服一组");
        when(accessService.requireGroup(any(), eq(GROUP_ID))).thenReturn(group);
        when(accounts.getById(ACCOUNT_ID)).thenReturn(account);
        when(accounts.updateById(any(CompanyChannelDO.class))).thenReturn(true);
        when(callbackUrls.callback(any(), eq(ACCOUNT_ID))).thenReturn("https://cb.dudu.local/api/channels/9401/callback");
        when(callbackUrls.localFallback()).thenReturn(false);

        service = new ConsoleChannelServiceImpl(accessService, accounts, mock(UserGroupService.class),
            mock(ConsoleChannelCatalog.class), new ConsoleChannelConfiguration(), callbackUrls, thirdImTokens,
            douyinOAuth, kuaishouOAuth, mock(ApplicationEventPublisher.class));
    }

    @Test
    void exchangesAuthCodeIntoRotatedTokensOnUpdate() {
        when(thirdImTokens.exchange("234", "1234abc", "fresh-code"))
            .thenReturn(new XiaohongshuThirdImTokenClient.ExchangeResult("at-new", "rt-new", null));

        service.update(null, ACCOUNT_ID.toString(),
            update(Map.of("authCode", "fresh-code")), ORIGIN);

        // 轮换双 token 随保存落库，一次性 auth_code 不入库
        assertThat(account.getChannelInfo())
            .hasSize(4)
            .containsEntry("appId", "234")
            .containsEntry("secret", "1234abc")
            .containsEntry("accessToken", "at-new")
            .containsEntry("refreshToken", "rt-new")
            .doesNotContainKey("authCode");
        verify(accounts).updateById(account);
    }

    @Test
    void rejectsSaveWhenExchangeFails() {
        when(thirdImTokens.exchange("234", "1234abc", "fresh-code"))
            .thenReturn(new XiaohongshuThirdImTokenClient.ExchangeResult(null, null,
                "换取小红书私信三方令牌失败：40001 auth_code expired"));

        // 保存整体拒绝促重新授权（旧授权码已作废），不落任何半份令牌
        assertThatThrownBy(() -> service.update(null, ACCOUNT_ID.toString(),
            update(Map.of("authCode", "fresh-code")), ORIGIN))
            .isInstanceOf(BizException.class)
            .hasMessageContaining("40001")
            .hasMessageContaining("重新授权")
            .extracting("apiEnum")
            .isEqualTo(ApiEnum.REQUEST_THIRD_ERROR);
        verify(accounts, never()).updateById(any(CompanyChannelDO.class));
    }

    @Test
    void skipsExchangeAndKeepsManualTokensWhenAuthCodeAbsent() {
        service.update(null, ACCOUNT_ID.toString(),
            update(Map.of("refreshToken", "manually-entered")), ORIGIN);

        // 未携带授权码的保存不触发出网，录入值原样落库
        verify(thirdImTokens, never()).exchange(any(), any(), any());
        assertThat(account.getChannelInfo())
            .containsEntry("refreshToken", "manually-entered")
            .doesNotContainKey("authCode");
        verify(accounts).updateById(account);
    }

    @Test
    void exchangesDouyinAuthCodeIntoRefreshTokenAndResetsRenewClock() {
        // 抖音授权码首换（docs/research/channels/douyin.md §6）：code 10 分钟一次性，
        // 保存即换首个 refreshToken；重新授权场景清除旧续期时刻，按保存时刻重新起算
        account.setChannel(ChannelEnum.DOUYIN);
        account.setChannelInfo(new LinkedHashMap<>(Map.of(
            "clientKey", "tt10abc", "clientSecret", "s",
            "refreshToken", "expired-rt", "refreshTokenRenewedAt", 1720000000000L)));
        when(douyinOAuth.exchange("tt10abc", "s", "fresh-code"))
            .thenReturn(new DouyinOAuthClient.ExchangeResult("rt-new", null));

        service.update(null, ACCOUNT_ID.toString(),
            update(Map.of("authCode", "fresh-code")), ORIGIN);

        assertThat(account.getChannelInfo())
            .containsEntry("clientKey", "tt10abc")
            .containsEntry("refreshToken", "rt-new")
            .doesNotContainKey("authCode")
            .doesNotContainKey("refreshTokenRenewedAt");
        verify(accounts).updateById(account);
    }

    @Test
    void rejectsDouyinSaveWhenExchangeFails() {
        account.setChannel(ChannelEnum.DOUYIN);
        account.setChannelInfo(new LinkedHashMap<>(Map.of("clientKey", "tt10abc", "clientSecret", "s")));
        when(douyinOAuth.exchange("tt10abc", "s", "used-code"))
            .thenReturn(new DouyinOAuthClient.ExchangeResult(null,
                "换取抖音 refreshToken 失败：10007 code已过期"));

        assertThatThrownBy(() -> service.update(null, ACCOUNT_ID.toString(),
            update(Map.of("authCode", "used-code")), ORIGIN))
            .isInstanceOf(BizException.class)
            .hasMessageContaining("10007")
            .hasMessageContaining("重新授权");
        verify(accounts, never()).updateById(any(CompanyChannelDO.class));
    }

    @Test
    void skipsDouyinExchangeWhenAuthCodeAbsent() {
        account.setChannel(ChannelEnum.DOUYIN);
        account.setChannelInfo(new LinkedHashMap<>(Map.of(
            "clientKey", "tt10abc", "clientSecret", "s", "refreshToken", "manual-rt")));

        service.update(null, ACCOUNT_ID.toString(),
            update(Map.of("refreshToken", "manual-rt-2")), ORIGIN);

        verify(douyinOAuth, never()).exchange(any(), any(), any());
        assertThat(account.getChannelInfo()).containsEntry("refreshToken", "manual-rt-2");
        verify(accounts).updateById(account);
    }

    @Test
    void exchangesKuaishouAuthCodeIntoTokenPairAndResetsRefreshClock() {
        // 快手授权码首换（docs/research/channels/kuaishou.md §8）：code 按 oauth 族惯例
        // 10 分钟一次性，保存即换双 token；重新授权场景清除旧刷新时刻，按保存时刻起算
        account.setChannel(ChannelEnum.KUAISHOU);
        account.setChannelInfo(new LinkedHashMap<>(Map.of(
            "appKey", "ks7001", "appSecret", "as", "signSecret", "ss",
            "accessToken", "stale-access", "refreshToken", "expired-rt",
            "refreshTokenRenewedAt", 1720000000000L)));
        when(kuaishouOAuth.exchange("ks7001", "as", "fresh-code"))
            .thenReturn(new KuaishouOAuthClient.ExchangeResult("at-new", "rt-new", null));

        service.update(null, ACCOUNT_ID.toString(),
            update(Map.of("authCode", "fresh-code")), ORIGIN);

        assertThat(account.getChannelInfo())
            .containsEntry("appKey", "ks7001")
            .containsEntry("accessToken", "at-new")
            .containsEntry("refreshToken", "rt-new")
            .doesNotContainKey("authCode")
            .doesNotContainKey("refreshTokenRenewedAt");
        verify(accounts).updateById(account);
    }

    @Test
    void rejectsKuaishouSaveWhenExchangeFails() {
        account.setChannel(ChannelEnum.KUAISHOU);
        account.setChannelInfo(new LinkedHashMap<>(Map.of("appKey", "ks7001", "appSecret", "as")));
        when(kuaishouOAuth.exchange("ks7001", "as", "used-code"))
            .thenReturn(new KuaishouOAuthClient.ExchangeResult(null, null,
                "换取快手令牌失败：1000 803000 access token expired"));

        assertThatThrownBy(() -> service.update(null, ACCOUNT_ID.toString(),
            update(Map.of("authCode", "used-code")), ORIGIN))
            .isInstanceOf(BizException.class)
            .hasMessageContaining("803000")
            .hasMessageContaining("重新授权");
        verify(accounts, never()).updateById(any(CompanyChannelDO.class));
    }

    @Test
    void skipsKuaishouExchangeWhenAuthCodeAbsent() {
        account.setChannel(ChannelEnum.KUAISHOU);
        account.setChannelInfo(new LinkedHashMap<>(Map.of(
            "appKey", "ks7001", "appSecret", "as", "signSecret", "ss", "refreshToken", "manual-rt")));

        service.update(null, ACCOUNT_ID.toString(),
            update(Map.of("refreshToken", "manual-rt-2")), ORIGIN);

        verify(kuaishouOAuth, never()).exchange(any(), any(), any());
        assertThat(account.getChannelInfo()).containsEntry("refreshToken", "manual-rt-2");
        verify(accounts).updateById(account);
    }

    @Test
    void exchangesKuaishouAuthCodeOnCreateIntoTokenPair() {
        // 建号携带授权码一步完成首换（与编辑同规则）：双 token 落库、授权码丢弃
        when(kuaishouOAuth.exchange("ks7001", "as", "fresh-code"))
            .thenReturn(new KuaishouOAuthClient.ExchangeResult("at-new", "rt-new", null));
        when(accounts.getById(isNull())).thenReturn(account);

        service.create(null, new ConsoleChannelRequests.Create(GROUP_ID.toString(), ChannelEnum.KUAISHOU,
            "快手主号", Map.of("appKey", "ks7001", "appSecret", "as", "authCode", "fresh-code")), ORIGIN);

        org.mockito.ArgumentCaptor<CompanyChannelDO> saved =
            org.mockito.ArgumentCaptor.forClass(CompanyChannelDO.class);
        verify(accounts).save(saved.capture());
        assertThat(saved.getValue().getChannelInfo())
            .containsEntry("appKey", "ks7001")
            .containsEntry("accessToken", "at-new")
            .containsEntry("refreshToken", "rt-new")
            .doesNotContainKey("authCode");
    }

    // ---- 夹具 ----

    private ConsoleChannelRequests.Update update(Map<String, Object> set) {
        return new ConsoleChannelRequests.Update("小红书主号", new ConsoleChannelRequests.Changes(set, List.of()));
    }
}
