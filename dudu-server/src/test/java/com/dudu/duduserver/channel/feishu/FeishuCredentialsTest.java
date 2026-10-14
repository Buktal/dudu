package com.dudu.duduserver.channel.feishu;

import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 飞书渠道凭据收窄验收：channel_info 四键读取、encryptKey 可选（空=明文模式）、
 * 任一必填键缺失按未配置处理；凭据不写入日志也不返回给 Desk。
 */
class FeishuCredentialsTest {

    @Test
    void ofReadsDocumentedKeysAndTreatsBlankEncryptKeyAsPlaintextMode() {
        FeishuCredentials credentials = FeishuCredentials.of(account(Map.of(
            "appId", "cli_9f5343c580712544",
            "appSecret", "dskLLdkasdjlasdKK",
            "verificationToken", "rvaYgkND1GOiu5MM0E1rncYC6PLtF7JV",
            "encryptKey", "test key")));

        assertThat(credentials.appId()).isEqualTo("cli_9f5343c580712544");
        assertThat(credentials.appSecret()).isEqualTo("dskLLdkasdjlasdKK");
        assertThat(credentials.verificationToken()).isEqualTo("rvaYgkND1GOiu5MM0E1rncYC6PLtF7JV");
        assertThat(credentials.encryptKey()).isEqualTo("test key");

        // 官方：Encrypt Key 为空 = 明文事件，无需解密与签名验签
        assertThat(FeishuCredentials.of(account(new HashMap<>(Map.of(
                "appId", "cli_9f5343c580712544",
                "appSecret", "dskLLdkasdjlasdKK",
                "verificationToken", "rvaYgkND1GOiu5MM0E1rncYC6PLtF7JV"))))
            .encryptKey()).isNull();
    }

    @Test
    void ofReturnsNullWhenAnyRequiredKeyIsMissingOrBlank() {
        assertThat(FeishuCredentials.of(account(Map.of(
            "appSecret", "s", "verificationToken", "t")))).isNull();
        assertThat(FeishuCredentials.of(account(Map.of(
            "appId", "cli_a", "verificationToken", "t")))).isNull();
        assertThat(FeishuCredentials.of(account(Map.of(
            "appId", "cli_a", "appSecret", "s")))).isNull();
        assertThat(FeishuCredentials.of(account(Map.of(
            "appId", "  ", "appSecret", "s", "verificationToken", "t")))).isNull();
    }

    @Test
    void ofToleratesMissingAccountAndEmptyInfo() {
        assertThat(FeishuCredentials.of(null)).isNull();
        assertThat(FeishuCredentials.of(account(null))).isNull();
        assertThat(FeishuCredentials.of(account(Map.of()))).isNull();
    }

    private CompanyChannelDO account(Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannel(ChannelEnum.FEISHU);
        account.setChannelInfo(channelInfo);
        return account;
    }
}
