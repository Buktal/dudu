package com.dudu.duduserver.channel.douyin;

import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 抖音渠道凭据收窄验收（事实见 docs/research/channels/douyin.md §6，键名照抄
 * mock-pulse config.rs serde camelCase）：clientKey/clientSecret 必填，
 * refreshToken 可选（发送授权刷新凭证，§6.1 结论）；任一必填键缺失返回 null
 * 由调用方按「该账号未配置」处理；凭据不写入日志也不返回给 Desk。
 */
class DouyinCredentialsTest {

    @Test
    void ofReadsMockPulseCamelCaseKeysAndKeepsRefreshTokenOptional() {
        DouyinCredentials credentials = DouyinCredentials.of(account(Map.of(
            "clientKey", "asdfavetgbvasf",
            "clientSecret", "9e096e3a2a8b4e0f9c0f",
            "refreshToken", "rft.1d1021d2aee3d41fee2d2ad")));

        assertThat(credentials.clientKey()).isEqualTo("asdfavetgbvasf");
        assertThat(credentials.clientSecret()).isEqualTo("9e096e3a2a8b4e0f9c0f");
        assertThat(credentials.refreshToken()).isEqualTo("rft.1d1021d2aee3d41fee2d2ad");

        // 未完成用户授权的账号仍可收发回调：refreshToken 缺失为 null
        assertThat(DouyinCredentials.of(account(new HashMap<>(Map.of(
                "clientKey", "asdfavetgbvasf",
                "clientSecret", "9e096e3a2a8b4e0f9c0f")))).refreshToken()).isNull();
    }

    @Test
    void ofReturnsNullWhenAnyRequiredKeyIsMissingOrBlank() {
        assertThat(DouyinCredentials.of(account(Map.of("clientSecret", "s")))).isNull();
        assertThat(DouyinCredentials.of(account(Map.of("clientKey", "k")))).isNull();
        assertThat(DouyinCredentials.of(account(Map.of("clientKey", "  ", "clientSecret", "s")))).isNull();
    }

    @Test
    void ofToleratesMissingAccountAndEmptyInfo() {
        assertThat(DouyinCredentials.of(null)).isNull();
        assertThat(DouyinCredentials.of(account(null))).isNull();
        assertThat(DouyinCredentials.of(account(Map.of()))).isNull();
    }

    private CompanyChannelDO account(Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannel(ChannelEnum.DOUYIN);
        account.setChannelInfo(channelInfo);
        return account;
    }
}
