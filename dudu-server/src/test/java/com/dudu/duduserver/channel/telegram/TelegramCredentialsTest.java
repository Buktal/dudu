package com.dudu.duduserver.channel.telegram;

import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Telegram 渠道凭据收窄验收（ADR-0013）：键名与 mock-pulse config.rs Telegram 变体的
 * serde 键一致（`url`/`secretToken`，camelCase），两字段均无缺省、缺一按该账号未配置
 * 返回 null；凭据不参与 toString 输出核对由 record 语义承载。
 */
class TelegramCredentialsTest {

    @Test
    void narrowsBothSerdeKeysFromChannelInfo() {
        Map<String, Object> info = new HashMap<>();
        info.put("url", "https://dudu.example.com/telegram");
        info.put("secretToken", "dudu-secret-token");

        TelegramCredentials credentials = TelegramCredentials.of(account(info));

        assertThat(credentials).isNotNull();
        assertThat(credentials.url()).isEqualTo("https://dudu.example.com/telegram");
        assertThat(credentials.secretToken()).isEqualTo("dudu-secret-token");
    }

    @Test
    void returnsNullWhenEitherKeyIsMissingOrBlank() {
        // 两字段均无 serde default：缺 url、缺 secretToken 与账号为空都按未配置处理
        assertThat(TelegramCredentials.of(account(Map.of("secretToken", "dudu-secret-token")))).isNull();
        assertThat(TelegramCredentials.of(account(Map.of("url", "https://dudu.example.com/telegram")))).isNull();
        assertThat(TelegramCredentials.of(account(Map.of("url", " ", "secretToken", "dudu-secret-token"))))
            .isNull();
        assertThat(TelegramCredentials.of(account(Map.of()))).isNull();
        assertThat(TelegramCredentials.of(null)).isNull();
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
