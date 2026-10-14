package com.dudu.duduserver.channel.meituan;

import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 美团渠道凭据收窄（docs/research/channels/meituan.md §6、§8；ADR-0013）：channel_info 键
 * 与 mock-pulse config.rs Meituan 变体一致（app_id/app_secret），两者都必备——缺失或空值
 * 任一按「该账号未配置」返回 null；凭据不写日志也不返回 Desk。
 */
class MeituanCredentialsTest {

    @Test
    void carriesBothConfiguredKeys() {
        MeituanCredentials credentials = MeituanCredentials.of(account(fullInfo()));

        assertThat(credentials).isNotNull();
        assertThat(credentials.appId()).isEqualTo("mt-app-1");
        assertThat(credentials.appSecret()).isEqualTo("mt-secret-1");
    }

    @Test
    void missingOrBlankKeyMeansUnconfigured() {
        // mock-pulse Meituan 变体两键均无缺省：缺失 app_id 或 app_secret 都不算已配置
        assertThat(MeituanCredentials.of(account(fullInfoWithout("app_id")))).isNull();
        assertThat(MeituanCredentials.of(account(fullInfoWithout("app_secret")))).isNull();
        assertThat(MeituanCredentials.of(account(Map.of()))).isNull();

        // 空串与非字符串值同样按未配置，不编造可用凭据
        Map<String, Object> blank = new HashMap<>(fullInfo());
        blank.put("app_secret", "  ");
        assertThat(MeituanCredentials.of(account(blank))).isNull();
        assertThat(MeituanCredentials.of(null)).isNull();
    }

    private Map<String, Object> fullInfo() {
        Map<String, Object> info = new HashMap<>();
        info.put("app_id", "mt-app-1");
        info.put("app_secret", "mt-secret-1");
        return info;
    }

    private Map<String, Object> fullInfoWithout(String key) {
        Map<String, Object> info = fullInfo();
        info.remove(key);
        return info;
    }

    private CompanyChannelDO account(Map<String, Object> info) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(4101L);
        account.setCompanyId(1L);
        account.setChannel(ChannelEnum.MEITUAN);
        account.setAccountName("美团");
        account.setChannelInfo(info);
        return account;
    }
}
