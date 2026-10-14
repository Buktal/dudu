package com.dudu.duduserver.channel.telegram;

import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Telegram 渠道凭据收窄验收（ADR-0013）：回调组只收 secretToken（恒等头比对），发送组
 * 只收含 /bot&lt;token&gt; 路径段的 Bot API 基址 url——两侧互不依赖，键名与 mock-pulse
 * config.rs Telegram 变体的 serde 键一致（camelCase）；缺一按该账号未配置返回 null；
 * 凭据不写入日志也不返回给 Desk。
 */
class TelegramCredentialsTest {

    @Test
    void narrowsSecretTokenFromChannelInfo() {
        TelegramCredentials credentials = TelegramCredentials.of(account(Map.of(
            "url", "https://dudu.example.com/telegram",
            "secretToken", "dudu-secret-token")));

        assertThat(credentials).isNotNull();
        assertThat(credentials.secretToken()).isEqualTo("dudu-secret-token");
    }

    @Test
    void returnsNullWhenSecretTokenIsMissingOrBlank() {
        // secretToken 无 serde default：缺失、空白与账号为空都按未配置处理
        assertThat(TelegramCredentials.of(account(Map.of("url", "https://dudu.example.com/telegram")))).isNull();
        assertThat(TelegramCredentials.of(account(Map.of("secretToken", " ")))).isNull();
        assertThat(TelegramCredentials.of(account(Map.of()))).isNull();
        assertThat(TelegramCredentials.of(null)).isNull();
    }

    @Test
    void sendCredentialsRequireUrlOnly() {
        // 发送组与回调组互不依赖：只配 url 的账号可发送，不要求 secretToken
        TelegramSendCredentials send = TelegramSendCredentials.of(account(Map.of(
            "url", "https://api.telegram.org/bot123456:ABC",
            "secretToken", "dudu-secret-token")));
        assertThat(send.url()).isEqualTo("https://api.telegram.org/bot123456:ABC");

        assertThat(TelegramSendCredentials.of(account(Map.of("secretToken", "dudu-secret-token")))).isNull();
        assertThat(TelegramSendCredentials.of(account(Map.of("url", " ")))).isNull();
        assertThat(TelegramSendCredentials.of(account(Map.of()))).isNull();
        assertThat(TelegramSendCredentials.of(null)).isNull();
    }

    private CompanyChannelDO account(Map<String, Object> info) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(4107L);
        account.setCompanyId(1L);
        account.setChannel(ChannelEnum.TELEGRAM);
        account.setAccountName("Telegram");
        account.setChannelInfo(info);
        return account;
    }
}
