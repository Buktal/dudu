package com.dudu.duduserver.service;

import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.service.impl.XiaohongshuThirdImTokenStorer;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 小红书私信三方令牌回写契约：账号不存在与落库未生效必须抛异常——刷新接口每次轮换
 * 双 token 且旧 token 5 分钟后失效（docs/research/channels/xiaohongshu.md §13.4），
 * 静默失败会让 job 误报成功而库内仍是失效 token，续期链路随之死亡；正常路径只改
 * accessToken/refreshToken 两键并保留其余键。
 */
class XiaohongshuThirdImTokenStorerTest {

    private final CompanyChannelService accounts = mock(CompanyChannelService.class);
    private final XiaohongshuThirdImTokenStorer store = new XiaohongshuThirdImTokenStorer(accounts);

    @Test
    void failsWhenAccountMissing() {
        when(accounts.getById(7L)).thenReturn(null);

        assertThatThrownBy(() -> store.store(7L, "new-access", "new-refresh"))
            .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void failsWhenUpdateDoesNotTakeEffect() {
        CompanyChannelDO account = new CompanyChannelDO();
        when(accounts.getById(7L)).thenReturn(account);
        when(accounts.updateById(any(CompanyChannelDO.class))).thenReturn(false);

        assertThatThrownBy(() -> store.store(7L, "new-access", "new-refresh"))
            .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void writesRotationPairAndKeepsOtherKeys() {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannelInfo(new LinkedHashMap<>(Map.of("appId", "123", "secret", "s")));
        when(accounts.getById(7L)).thenReturn(account);
        when(accounts.updateById(any(CompanyChannelDO.class))).thenReturn(true);

        store.store(7L, "new-access", "new-refresh");

        assertThat(account.getChannelInfo())
            .hasSize(4)
            .containsEntry("appId", "123")
            .containsEntry("secret", "s")
            .containsEntry("accessToken", "new-access")
            .containsEntry("refreshToken", "new-refresh");
    }
}
