package com.dudu.duduserver.channel.alipay;

import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 支付宝回调与发送共用凭据验证：从 company_channel.channel_info 读取 appId 与
 * appPrivateKey（键名与 mock-pulse config.rs Alipay 变体一致）；缺失任一返回 null，
 * 凭据不落入 toString 之外的日志路径由调用方保证。
 */
class AlipayCredentialsTest {

    @Test
    void readsAppIdAndPrivateKeyFromChannelInfo() {
        AlipayCredentials credentials = AlipayCredentials.of(account(Map.of(
            "appId", "2014072300007148",
            "appPrivateKey", "MIIBVAIBADANBgkqhkiG9w0BAQEFAASC")));

        assertThat(credentials.appId()).isEqualTo("2014072300007148");
        assertThat(credentials.appPrivateKey()).isEqualTo("MIIBVAIBADANBgkqhkiG9w0BAQEFAASC");
    }

    @Test
    void returnsNullWhenAnyCredentialMissingOrBlank() {
        assertThat(AlipayCredentials.of(account(Map.of()))).isNull();
        assertThat(AlipayCredentials.of(account(Map.of("appId", "2014072300007148")))).isNull();
        assertThat(AlipayCredentials.of(account(Map.of("appPrivateKey", "MIIB")))).isNull();
        assertThat(AlipayCredentials.of(account(Map.of("appId", " ", "appPrivateKey", "MIIB")))).isNull();
        assertThat(AlipayCredentials.of(null)).isNull();
    }

    private CompanyChannelDO account(Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannel(ChannelEnum.ALIPAY);
        account.setChannelInfo(channelInfo);
        return account;
    }
}
