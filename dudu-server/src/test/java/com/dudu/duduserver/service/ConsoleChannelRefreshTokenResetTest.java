package com.dudu.duduserver.service;

import com.dudu.duduserver.channel.console.ConsoleCallbackUrls;
import com.dudu.duduserver.channel.console.ConsoleChannelCatalog;
import com.dudu.duduserver.channel.console.ConsoleChannelConfiguration;
import com.dudu.duduserver.channel.douyin.DouyinOAuthClient;
import com.dudu.duduserver.channel.kuaishou.KuaishouOAuthClient;
import com.dudu.duduserver.channel.xiaohongshuthirdim.XiaohongshuThirdImTokenClient;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Console 保存重置抖音续期时刻验收：重新录入 refreshToken 即视为新授权链起点，保存
 * 清除服务端键 refreshTokenRenewedAt（DouyinRefreshTokenRefresher 改按保存时刻起算），
 * 避免旧时刻立即触发对新链 token 的续期烧掉 5 次轮换配额（docs/research/channels/
 * douyin.md §9.6）；值未变或未提交 refreshToken 的保存不重置。
 */
class ConsoleChannelRefreshTokenResetTest {

    private static final Long ACCOUNT_ID = 9301L;
    private static final Long GROUP_ID = 5L;
    private static final String ORIGIN = "https://console.dudu.local";

    private CompanyChannelDO account;

    private ConsoleChannelServiceImpl service;

    @BeforeEach
    void setUp() {
        account = new CompanyChannelDO();
        account.setCompanyChannelId(ACCOUNT_ID);
        account.setCompanyId(77L);
        account.setGroupId(GROUP_ID);
        account.setChannel(ChannelEnum.DOUYIN);
        account.setAccountName("抖音主号");
        account.setChannelInfo(new LinkedHashMap<>(Map.of(
            "clientKey", "tt10abc", "clientSecret", "s",
            "refreshToken", "old-rt", "refreshTokenRenewedAt", 1720000000000L)));

        ConsoleAccessService accessService = mock(ConsoleAccessService.class);
        CompanyChannelService accounts = mock(CompanyChannelService.class);
        CompanyDO company = new CompanyDO();
        company.setCompanyId(77L);
        UserDO user = new UserDO();
        user.setUserId(9L);
        when(accessService.lock(any())).thenReturn(new ConsoleAccess(company, user, Set.of(GROUP_ID)));
        UserGroupDO group = new UserGroupDO();
        group.setGroupId(GROUP_ID);
        group.setGroupName("客服一组");
        when(accessService.requireGroup(any(), eq(GROUP_ID))).thenReturn(group);
        when(accounts.getById(ACCOUNT_ID)).thenReturn(account);
        when(accounts.updateById(any(CompanyChannelDO.class))).thenReturn(true);
        ConsoleCallbackUrls callbackUrls = mock(ConsoleCallbackUrls.class);
        when(callbackUrls.callback(any(), eq(ACCOUNT_ID))).thenReturn("https://cb.dudu.local/api/channels/9301/callback");
        when(callbackUrls.localFallback()).thenReturn(false);

        service = new ConsoleChannelServiceImpl(accessService, accounts, mock(UserGroupService.class),
            mock(ConsoleChannelCatalog.class), new ConsoleChannelConfiguration(), callbackUrls,
            mock(XiaohongshuThirdImTokenClient.class), mock(DouyinOAuthClient.class),
            mock(KuaishouOAuthClient.class), mock(ApplicationEventPublisher.class));
    }

    @Test
    void resetsRenewedAtWhenRefreshTokenReEntered() {
        service.update(null, ACCOUNT_ID.toString(),
            update(Map.of("refreshToken", "new-rt")), ORIGIN);

        assertThat(account.getChannelInfo())
            .containsEntry("refreshToken", "new-rt")
            .doesNotContainKey("refreshTokenRenewedAt");
    }

    @Test
    void keepsRenewedAtWhenRefreshTokenNotSubmitted() {
        service.update(null, ACCOUNT_ID.toString(),
            update(Map.of("clientSecret", "s2")), ORIGIN);

        assertThat(account.getChannelInfo())
            .containsEntry("clientSecret", "s2")
            .containsEntry("refreshTokenRenewedAt", 1720000000000L);
    }

    @Test
    void keepsRenewedAtWhenSameTokenResubmitted() {
        service.update(null, ACCOUNT_ID.toString(),
            update(Map.of("refreshToken", "old-rt")), ORIGIN);

        assertThat(account.getChannelInfo())
            .containsEntry("refreshToken", "old-rt")
            .containsEntry("refreshTokenRenewedAt", 1720000000000L);
    }

    // ---- 夹具 ----

    private ConsoleChannelRequests.Update update(Map<String, Object> set) {
        return new ConsoleChannelRequests.Update("抖音主号", new ConsoleChannelRequests.Changes(set, List.of()));
    }
}
