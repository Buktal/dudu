package com.dudu.duduserver.channel.dingtalk;

import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 钉钉渠道凭据收窄验收：接收侧键与 MockPulse config.rs 一致（url/system/token/
 * encodingAesKey/ownerKey，system 缺省 http_crypto），发送侧 appKey/appSecret/agentId
 * 沿公众号 appSecret 先例；任一必需键缺失整组返回 null，凭据不进日志、不返回 Desk。
 */
class DingtalkCredentialsTest {

    @Test
    void narrowsReceiveCredentialsWithDefaultSystem() {
        CompanyChannelDO account = account(Map.of("url", "https://desk.example/api/channels/1/callback",
            "token", "callback-token", "encodingAesKey", "a".repeat(43), "ownerKey", "ding9f50b15bxxxx16741"));

        DingtalkCredentials credentials = DingtalkCredentials.of(account);

        assertThat(credentials).isNotNull();
        assertThat(credentials.url())
            .isEqualTo("https://desk.example/api/channels/1/callback");
        assertThat(credentials.system()).isEqualTo("http_crypto");
        assertThat(credentials.token()).isEqualTo("callback-token");
        assertThat(credentials.encodingAesKey()).isEqualTo("a".repeat(43));
        assertThat(credentials.ownerKey()).isEqualTo("ding9f50b15bxxxx16741");
    }

    @Test
    void keepsExplicitSystemValue() {
        CompanyChannelDO account = account(Map.of("token", "t", "encodingAesKey", "a".repeat(43),
            "ownerKey", "o", "system", "bot"));

        assertThat(DingtalkCredentials.of(account).system()).isEqualTo("bot");
    }

    @Test
    void missesReceiveCredentialsWhenAnyRequiredKeyBlank() {
        // token/encodingAesKey/ownerKey 任一缺失即整组不可用；url 非接收必需
        assertThat(DingtalkCredentials.of(account(Map.of("token", "t", "ownerKey", "o")))).isNull();
        assertThat(DingtalkCredentials.of(account(Map.of("encodingAesKey", "a".repeat(43), "ownerKey", "o")))).isNull();
        assertThat(DingtalkCredentials.of(account(Map.of("token", "t", "encodingAesKey", "a".repeat(43))))).isNull();
        assertThat(DingtalkCredentials.of(account(Map.of("token", "", "encodingAesKey", "a".repeat(43),
            "ownerKey", "o")))).isNull();
        assertThat(DingtalkCredentials.of(account(Map.of("token", "   ", "encodingAesKey", "a".repeat(43),
            "ownerKey", "o")))).isNull();
    }

    @Test
    void narrowsSendCredentialsAndMissesWhenAnyKeyBlank() {
        CompanyChannelDO complete = account(Map.of("appKey", "dingeqqpkv3xxxxxx", "appSecret", "GT-lsu-taDAxxx",
            "agentId", "123456789"));
        DingtalkSendCredentials send = DingtalkSendCredentials.of(complete);
        assertThat(send.appKey()).isEqualTo("dingeqqpkv3xxxxxx");
        assertThat(send.appSecret()).isEqualTo("GT-lsu-taDAxxx");
        assertThat(send.agentId()).isEqualTo("123456789");

        assertThat(DingtalkSendCredentials.of(account(Map.of("appKey", "k", "appSecret", "s")))).isNull();
        assertThat(DingtalkSendCredentials.of(account(Map.of("appSecret", "s", "agentId", "1")))).isNull();
        assertThat(DingtalkSendCredentials.of(account(Map.of("appKey", "k", "agentId", "1")))).isNull();
    }

    @Test
    void toleratesAbsentChannelInfo() {
        assertThat(DingtalkCredentials.of(account(new HashMap<>()))).isNull();
        assertThat(DingtalkCredentials.of(account(null))).isNull();
        assertThat(DingtalkSendCredentials.of(account(null))).isNull();
    }

    private CompanyChannelDO account(Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannel(ChannelEnum.DINGTALK);
        account.setChannelInfo(channelInfo);
        return account;
    }
}
