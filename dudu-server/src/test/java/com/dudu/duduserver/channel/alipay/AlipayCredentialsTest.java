package com.dudu.duduserver.channel.alipay;

import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 支付宝回调与发送共用凭据验证：从 company_channel.channel_info 读取 appId、appPrivateKey
 * 与 alipayPublicKey（前两键与 mock-pulse config.rs Alipay 变体一致，alipayPublicKey 为
 * 回调验签扩展）；缺失任一返回 null，凭据不落入 toString 之外的日志路径由调用方保证。
 */
class AlipayCredentialsTest {

    private static final String APP_PRIVATE_KEY = "MIIBVAIBADANBgkqhkiG9w0BAQEFAASC";
    private static final String ALIPAY_PUBLIC_KEY = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA";

    @Test
    void readsCredentialsFromChannelInfo() {
        AlipayCredentials credentials = AlipayCredentials.of(account(Map.of(
            "appId", "2014072300007148",
            "appPrivateKey", APP_PRIVATE_KEY,
            "alipayPublicKey", ALIPAY_PUBLIC_KEY)));

        assertThat(credentials.appId()).isEqualTo("2014072300007148");
        assertThat(credentials.appPrivateKey()).isEqualTo(APP_PRIVATE_KEY);
        assertThat(credentials.alipayPublicKey()).isEqualTo(ALIPAY_PUBLIC_KEY);
    }

    @Test
    void returnsNullWhenAnyCredentialMissingOrBlank() {
        assertThat(AlipayCredentials.of(account(Map.of()))).isNull();
        assertThat(AlipayCredentials.of(account(Map.of("appId", "2014072300007148")))).isNull();
        assertThat(AlipayCredentials.of(account(Map.of("appPrivateKey", "MIIB")))).isNull();
        // 平台公钥缺失同样按该账号未配置处理：回调验签无从进行
        assertThat(AlipayCredentials.of(account(Map.of("appId", "2014072300007148",
            "appPrivateKey", APP_PRIVATE_KEY)))).isNull();
        assertThat(AlipayCredentials.of(account(Map.of("appId", " ", "appPrivateKey", "MIIB",
            "alipayPublicKey", ALIPAY_PUBLIC_KEY)))).isNull();
        assertThat(AlipayCredentials.of(null)).isNull();
    }

    private CompanyChannelDO account(Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannel(ChannelEnum.ALIPAY);
        account.setChannelInfo(channelInfo);
        return account;
    }
}
