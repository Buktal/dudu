package com.dudu.duduserver.channel.feishu;

import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 飞书渠道凭据收窄验收（ADR-0013）：回调组只收 verificationToken（明文比对）与可选
 * encryptKey（空 = 明文模式），appId 为回调与发送两侧共用的应用定位符；发送侧完整凭据
 * 由 FeishuSendCredentials 收窄（appSecret 不在回调组）。任一必填键缺失按未配置处理；
 * 凭据不写入日志也不返回给 Desk。
 */
class FeishuCredentialsTest {

    @Test
    void ofReadsCallbackKeysAndTreatsBlankEncryptKeyAsPlaintextMode() {
        FeishuCredentials credentials = FeishuCredentials.of(account(Map.of(
            "appId", "cli_9f5343c580712544",
            "appSecret", "dskLLdkasdjlasdKK",
            "verificationToken", "rvaYgkND1GOiu5MM0E1rncYC6PLtF7JV",
            "encryptKey", "test key")));

        assertThat(credentials.appId()).isEqualTo("cli_9f5343c580712544");
        assertThat(credentials.verificationToken()).isEqualTo("rvaYgkND1GOiu5MM0E1rncYC6PLtF7JV");
        assertThat(credentials.encryptKey()).isEqualTo("test key");

        // 官方：Encrypt Key 为空 = 明文事件，无需解密与签名验签
        assertThat(FeishuCredentials.of(account(new HashMap<>(Map.of(
                "appId", "cli_9f5343c580712544",
                "verificationToken", "rvaYgkND1GOiu5MM0E1rncYC6PLtF7JV"))))
            .encryptKey()).isNull();
    }

    @Test
    void ofReturnsNullWhenAnyRequiredKeyIsMissingOrBlank() {
        assertThat(FeishuCredentials.of(account(Map.of(
            "verificationToken", "t")))).isNull();
        assertThat(FeishuCredentials.of(account(Map.of(
            "appId", "cli_a")))).isNull();
        assertThat(FeishuCredentials.of(account(Map.of(
            "appId", "  ", "verificationToken", "t")))).isNull();
    }

    @Test
    void ofToleratesMissingAccountAndEmptyInfo() {
        assertThat(FeishuCredentials.of(null)).isNull();
        assertThat(FeishuCredentials.of(account(null))).isNull();
        assertThat(FeishuCredentials.of(account(Map.of()))).isNull();
    }

    @Test
    void sendCredentialsRequireAppIdAndAppSecretOnly() {
        // 发送组与回调组互不依赖：只配 appId/appSecret 的账号可发送，不要求 verificationToken
        FeishuSendCredentials send = FeishuSendCredentials.of(account(Map.of(
            "appId", "cli_9f5343c580712544", "appSecret", "dskLLdkasdjlasdKK")));
        assertThat(send.appId()).isEqualTo("cli_9f5343c580712544");
        assertThat(send.appSecret()).isEqualTo("dskLLdkasdjlasdKK");

        assertThat(FeishuSendCredentials.of(account(Map.of("appId", "cli_a")))).isNull();
        assertThat(FeishuSendCredentials.of(account(Map.of("appSecret", "s")))).isNull();
        assertThat(FeishuSendCredentials.of(account(Map.of()))).isNull();
        assertThat(FeishuSendCredentials.of(null)).isNull();
    }

    private CompanyChannelDO account(Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannel(ChannelEnum.FEISHU);
        account.setChannelInfo(channelInfo);
        return account;
    }
}
