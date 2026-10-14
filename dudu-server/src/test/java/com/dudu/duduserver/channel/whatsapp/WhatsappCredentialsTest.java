package com.dudu.duduserver.channel.whatsapp;

import com.dudu.duduserver.entity.CompanyChannelDO;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * WhatsApp 回调凭据收窄验收（键对照 mock-pulse config.rs Whatsapp 变体）：url/appSecret/
 * verifyToken 三字段均必填（官方侧三个值各司其职、无 default），任一缺失整组返回 null
 * 由调用方按「该账号未配置」处理；空串与空白同缺失。
 */
class WhatsappCredentialsTest {

    private static final Map<String, Object> FULL_INFO = Map.of(
        "url", "https://dudu.example.com/api/channels/1/callback",
        "appSecret", "whatsapp_app_secret",
        "verifyToken", "meaty-hammer-7");

    @Test
    void ofNarrowsAllThreeCamelCaseKeys() {
        WhatsappCredentials credentials = WhatsappCredentials.of(account(FULL_INFO));
        assertThat(credentials).isNotNull();
        assertThat(credentials.url()).isEqualTo("https://dudu.example.com/api/channels/1/callback");
        assertThat(credentials.appSecret()).isEqualTo("whatsapp_app_secret");
        assertThat(credentials.verifyToken()).isEqualTo("meaty-hammer-7");
    }

    @Test
    void ofReturnsNullWhenAnyRequiredKeyMissingOrBlank() {
        for (String key : new String[] {"url", "appSecret", "verifyToken"}) {
            Map<String, Object> info = new HashMap<>(FULL_INFO);
            info.remove(key);
            assertThat(WhatsappCredentials.of(account(info))).as(key + " 缺失").isNull();

            Map<String, Object> blank = new HashMap<>(FULL_INFO);
            blank.put(key, "  ");
            assertThat(WhatsappCredentials.of(account(blank))).as(key + " 空白").isNull();
        }
    }

    @Test
    void ofReturnsNullForNullAccountOrEmptyInfo() {
        assertThat(WhatsappCredentials.of(null)).isNull();
        assertThat(WhatsappCredentials.of(account(Map.of()))).isNull();
    }

    private CompanyChannelDO account(Map<String, Object> info) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(112001L);
        account.setChannelInfo(info);
        return account;
    }
}
