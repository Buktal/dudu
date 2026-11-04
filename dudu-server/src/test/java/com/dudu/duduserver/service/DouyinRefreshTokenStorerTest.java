package com.dudu.duduserver.service;

import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.service.impl.DouyinRefreshTokenStorer;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 抖音 refreshToken 条件回写契约（docs/research/channels/douyin.md §9.6：旧值一经
 * 使用即失效，落库须原子更新并防并发双刷）：库内 refreshToken 已不是本轮送审的
 * 旧值（并发续期或重新录入）时不出 UPDATE、返回 false 由调用方放弃本次产物；
 * 正常路径只改 refreshToken 与 refreshTokenRenewedAt 两键并保留其余键。
 */
class DouyinRefreshTokenStorerTest {

    private final CompanyChannelService accounts = mock(CompanyChannelService.class);
    private final DouyinRefreshTokenStorer store = new DouyinRefreshTokenStorer(accounts);

    @Test
    void returnsFalseWhenAccountMissing() {
        when(accounts.getById(7L)).thenReturn(null);

        assertThat(store.storeIfCurrent(7L, "old-token", "new-token", 1720000000000L)).isFalse();
        verify(accounts, never()).update(any(), any());
    }

    @Test
    void skipsUpdateWhenStoredTokenAlreadyChanged() {
        // 读-改-写快速短路：库内已是别的值（并发续期或重新录入），本轮旧值失效即放弃
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannelInfo(new LinkedHashMap<>(Map.of("refreshToken", "token-from-other-chain")));
        when(accounts.getById(7L)).thenReturn(account);

        assertThat(store.storeIfCurrent(7L, "old-token", "new-token", 1720000000000L)).isFalse();
        verify(accounts, never()).update(any(), any());
    }

    @Test
    void writesRotationAndRenewedAtKeepingOtherKeys() {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannelInfo(new LinkedHashMap<>(Map.of(
            "clientKey", "tt10abc", "clientSecret", "s", "refreshToken", "old-token")));
        when(accounts.getById(7L)).thenReturn(account);
        when(accounts.update(any(CompanyChannelDO.class), any())).thenReturn(true);

        assertThat(store.storeIfCurrent(7L, "old-token", "new-token", 1720000000000L)).isTrue();

        // 条件更新只提交 channel_info：新值与续期时刻写入，其余键保留
        ArgumentCaptor<CompanyChannelDO> patch = ArgumentCaptor.forClass(CompanyChannelDO.class);
        verify(accounts).update(patch.capture(), any());
        Map<String, Object> info = patch.getValue().getChannelInfo();
        assertThat(info)
            .hasSize(4)
            .containsEntry("clientKey", "tt10abc")
            .containsEntry("clientSecret", "s")
            .containsEntry("refreshToken", "new-token")
            .containsEntry("refreshTokenRenewedAt", 1720000000000L);
    }

    @Test
    void returnsFalseWhenConditionalUpdateMisses() {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannelInfo(new LinkedHashMap<>(Map.of("refreshToken", "old-token")));
        when(accounts.getById(7L)).thenReturn(account);
        when(accounts.update(any(CompanyChannelDO.class), any())).thenReturn(false);

        assertThat(store.storeIfCurrent(7L, "old-token", "new-token", 1720000000000L)).isFalse();
    }
}
