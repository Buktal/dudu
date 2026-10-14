package com.dudu.duduserver.channel.xiaohongshu;

import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 小红书回调凭据收窄验收：channel_info 键与 mock-pulse config.rs Xiaohongshu 变体一致
 * （token/encodingAesKey/appId，camelCase），三者缺一不可——缺失即按「该账号未配置」
 * 处理（of() 返回 null 由调用方兜底）；url/system 为 mock 侧连接键，服务端不读取。
 */
class XiaohongshuCredentialsTest {

    @Test
    void readsMockPulseCamelCaseKeysWhenAllThreePresent() {
        XiaohongshuCredentials credentials = XiaohongshuCredentials.of(account(Map.of(
            "url", "https://desk.example/api/channels/x/callback",
            "token", "xhs-callback-token",
            "encodingAesKey", "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C",
            "appId", "wx5823bf96d3bd56c7")));

        assertThat(credentials).isNotNull();
        assertThat(credentials.token()).isEqualTo("xhs-callback-token");
        assertThat(credentials.encodingAesKey()).isEqualTo("jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C");
        assertThat(credentials.appId()).isEqualTo("wx5823bf96d3bd56c7");
    }

    @Test
    void returnsNullWhenAnyOfTheThreeRuntimeKeysIsMissing() {
        assertThat(XiaohongshuCredentials.of(account(Map.of(
            "token", "t", "encodingAesKey", "k", "appId", "a")))).isNotNull();
        assertThat(XiaohongshuCredentials.of(account(Map.of(
            "encodingAesKey", "k", "appId", "a")))).isNull();
        assertThat(XiaohongshuCredentials.of(account(Map.of(
            "token", "t", "appId", "a")))).isNull();
        assertThat(XiaohongshuCredentials.of(account(Map.of(
            "token", "t", "encodingAesKey", "k")))).isNull();
    }

    @Test
    void blankValueCountsAsMissingAndNullAccountHasNoCredentials() {
        assertThat(XiaohongshuCredentials.of(account(Map.of(
            "token", " ", "encodingAesKey", "k", "appId", "a")))).isNull();
        assertThat(XiaohongshuCredentials.of(null)).isNull();
    }

    private CompanyChannelDO account(Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannel(ChannelEnum.XIAOHONGSHU);
        account.setChannelInfo(channelInfo);
        return account;
    }
}
