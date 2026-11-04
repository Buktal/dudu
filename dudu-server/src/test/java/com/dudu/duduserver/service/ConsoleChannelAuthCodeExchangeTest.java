package com.dudu.duduserver.service;

import com.dudu.duduserver.channel.console.ConsoleCallbackUrls;
import com.dudu.duduserver.channel.console.ConsoleChannelCatalog;
import com.dudu.duduserver.channel.console.ConsoleChannelConfiguration;
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
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Console 保存小红书三方私信授权码首换验收：auth_code 10 分钟时效且一次性，保存即同步
 * 换取（docs/research/channels/xiaohongshu.md §13.4）；换取成功把轮换双 token 写入
 * channel_info 并丢弃授权码，失败整体拒绝促重新授权，未携带授权码的保存不触发出网。
 */
class ConsoleChannelAuthCodeExchangeTest {

    private static final Long ACCOUNT_ID = 9401L;
    private static final Long GROUP_ID = 5L;
    private static final String ORIGIN = "https://console.dudu.local";

    private final ConsoleAccessService accessService = mock(ConsoleAccessService.class);
    private final CompanyChannelService accounts = mock(CompanyChannelService.class);
    private final XiaohongshuThirdImTokenClient thirdImTokens = mock(XiaohongshuThirdImTokenClient.class);
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
            mock(ApplicationEventPublisher.class));
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

    // ---- 夹具 ----

    private ConsoleChannelRequests.Update update(Map<String, Object> set) {
        return new ConsoleChannelRequests.Update("小红书主号", new ConsoleChannelRequests.Changes(set, List.of()));
    }
}
