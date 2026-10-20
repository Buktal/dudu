package com.dudu.duduserver.channel.console;

import com.dudu.duduserver.constant.ChannelEnum;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.Arguments;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import java.util.stream.Stream;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import java.util.List;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;

class ConsoleChannelConfigurationTest {
    private final ConsoleChannelConfiguration configuration = new ConsoleChannelConfiguration();

    @Test
    void telegramStoresOfficialUrlAndKeepsBotIdentityAfterClearingToken() {
        Map<String, Object> created = configuration.merge(ChannelEnum.TELEGRAM, Map.of(),
            Map.of("secretToken", " callback-secret ", "botToken", "123:abc_DEF"), List.of(), "https://public.example/api/channels/1/callback");
        assertThat(created).containsEntry("url", "https://api.telegram.org/bot123:abc_DEF")
            .containsEntry("botId", "123").containsEntry("secretToken", " callback-secret ");
        Map<String, Object> cleared = configuration.merge(ChannelEnum.TELEGRAM, created, Map.of(), List.of("botToken"), "unused");
        assertThat(cleared).containsEntry("botId", "123").doesNotContainKey("url");
    }

    static Stream<Arguments> receiveCases() {
        return Stream.of(
            Arguments.of(ChannelEnum.WECHAT_MP, Map.of("token", "secret"), List.of("appId", "appSecret")),
            Arguments.of(ChannelEnum.WECHAT_MINI, Map.of("token", "secret"), List.of("appId", "appSecret")),
            Arguments.of(ChannelEnum.WECOM, Map.of("corpId", "corp", "token", "secret", "encodingAesKey", "aes"), List.of("corpSecret", "agentId")),
            Arguments.of(ChannelEnum.QQ, Map.of("appSecret", "secret"), List.of("appId")),
            Arguments.of(ChannelEnum.WEIBO, Map.of("appSecret", "secret"), List.of("accessToken")),
            Arguments.of(ChannelEnum.FEISHU, Map.of("appId", "app", "verificationToken", "secret"), List.of("appSecret")),
            Arguments.of(ChannelEnum.ALIPAY, Map.of("appId", "app", "appPrivateKey", "private", "alipayPublicKey", "public"), List.of()),
            Arguments.of(ChannelEnum.DOUYIN, Map.of("clientKey", "key", "clientSecret", "secret"), List.of("refreshToken")),
            Arguments.of(ChannelEnum.XIAOHONGSHU, Map.of("appId", "app", "token", "secret", "encodingAesKey", "aes"), List.of("appSecret")),
            Arguments.of(ChannelEnum.DINGTALK, Map.of("ownerKey", "owner", "token", "secret", "encodingAesKey", "aes"), List.of("appKey", "appSecret", "agentId")),
            Arguments.of(ChannelEnum.MEITUAN, Map.of("app_id", "app", "app_secret", "secret"), List.of()),
            Arguments.of(ChannelEnum.WHATSAPP, Map.of("appSecret", "secret", "verifyToken", "verify"), List.of("accessToken", "phoneNumberId")),
            Arguments.of(ChannelEnum.TELEGRAM, Map.of("secretToken", "secret"), List.of("botToken"))
        );
    }

    @ParameterizedTest
    @MethodSource("receiveCases")
    void thirteenChannelReceiveConfigurationsRemainIndependentOfOptionalSendFields(ChannelEnum channel,
            Map<String, Object> input, List<String> missingSend) {
        Map<String, Object> saved = configuration.merge(channel, Map.of(), input, List.of(), "https://public.example/api/channels/1/callback");
        var result = configuration.describe(channel, saved);
        assertThat(result.receiveConfigured()).isTrue();
        assertThat(result.missingSendFields()).containsExactlyElementsOf(missingSend);
        assertThat(result.sendConfigured()).isEqualTo(missingSend.isEmpty());
        assertThat(result.fields().values()).doesNotContain("secret", "private", "aes", "verify");
    }

    @Test
    void telegramRejectsUrlInjectionAndDifferentBotAfterClearAndPreservesLegacyUnknownKeys() {
        Map<String, Object> old = Map.of("secretToken", "callback", "url", "https://api.telegram.org/bot123:old", "unknown", "preserved");
        Map<String, Object> cleared = configuration.merge(ChannelEnum.TELEGRAM, old, Map.of(), List.of("botToken"), "unused");
        assertThat(cleared).containsEntry("unknown", "preserved");
        assertThatThrownBy(() -> configuration.merge(ChannelEnum.TELEGRAM, cleared, Map.of("botToken", "456:new"), List.of(), "unused"))
            .isInstanceOf(BizException.class).satisfies(error -> assertThat(((BizException) error).apiEnum()).isEqualTo(ApiEnum.DATA_NOT_ALLOW));
        for (String token : List.of("123:token/", "123:token?x=y", "https://evil.example", "123:token#x", " 123:token")) {
            assertThatThrownBy(() -> configuration.merge(ChannelEnum.TELEGRAM, cleared, Map.of("botToken", token), List.of(), "unused"))
                .isInstanceOf(BizException.class);
        }
        for (String key : List.of("url", "botId")) {
            assertThatThrownBy(() -> configuration.merge(ChannelEnum.TELEGRAM, old, Map.of(key, "value"), List.of(), "unused"))
                .isInstanceOf(BizException.class);
        }
        assertThatThrownBy(() -> configuration.merge(ChannelEnum.TELEGRAM, Map.of("secretToken", "callback", "url", "https://legacy.example/token"), Map.of(), List.of("botToken"), "unused"))
            .isInstanceOf(BizException.class);
    }

    @Test
    void fixedIdentityAndReceiveFieldsCannotBeClearedAndPemIsNotTrimmed() {
        Map<String, Object> original = Map.of("token", "secret", "appId", "identity", "appSecret", "sending", "legacy", 42);
        assertThat(configuration.merge(ChannelEnum.WECHAT_MP, original, Map.of("appSecret", " new-secret "), List.of(), "unused"))
            .containsEntry("appSecret", " new-secret ").containsEntry("legacy", 42);
        for (String key : List.of("token", "appId")) {
            assertThatThrownBy(() -> configuration.merge(ChannelEnum.WECHAT_MP, original, Map.of(), List.of(key), "unused"))
                .isInstanceOf(BizException.class);
        }
        assertThatThrownBy(() -> configuration.merge(ChannelEnum.WECHAT_MP, original, Map.of("appId", "different"), List.of(), "unused"))
            .isInstanceOf(BizException.class);
        String pem = "\n-----BEGIN KEY-----\nvalue\n-----END KEY-----\n";
        assertThat(configuration.merge(ChannelEnum.ALIPAY, Map.of(), Map.of("appId", " app ", "appPrivateKey", pem, "alipayPublicKey", pem), List.of(), "unused"))
            .containsEntry("appId", "app").containsEntry("appPrivateKey", pem).containsEntry("alipayPublicKey", pem);
    }

    @Test
    void conditionalEncryptionAndUnsupportedSystemsAreRejectedWithoutChangingInput() {
        Map<String, Object> old = Map.of("corpId", "corp", "token", "secret", "encodingAesKey", "aes", "system", "aibot");
        assertThat(configuration.describe(ChannelEnum.WECOM, old).receiveConfigured()).isFalse();
        assertThat(configuration.describe(ChannelEnum.WECOM, old).notes()).isNotEmpty();
        assertThatThrownBy(() -> configuration.merge(ChannelEnum.WECOM, old, Map.of(), List.of(), "unused")).isInstanceOf(BizException.class);
        assertThatThrownBy(() -> configuration.merge(ChannelEnum.WECHAT_MINI, Map.of(), Map.of("token", "secret", "encodingAesKey", "aes"), List.of(), "unused")).isInstanceOf(BizException.class);
        assertThatThrownBy(() -> configuration.merge(ChannelEnum.WECHAT_MP, Map.of(), Map.of("token", "secret", "system", "untrusted"), List.of(), "unused")).isInstanceOf(BizException.class);
        assertThatThrownBy(() -> configuration.merge(ChannelEnum.WECHAT_MP, Map.of(), Map.of("token", "  "), List.of(), "unused")).isInstanceOf(BizException.class);
        assertThatThrownBy(() -> configuration.merge(ChannelEnum.WECHAT_MP, Map.of(), Map.of("token", 123), List.of(), "unused")).isInstanceOf(BizException.class);
        assertThatThrownBy(() -> configuration.merge(ChannelEnum.WECHAT_MP, Map.of(), Map.of("token", "x".repeat(4097)), List.of(), "unused")).isInstanceOf(BizException.class);
    }

    @Test
    void unsupportedLegacyChannelIsSafeToReadAndCannotBeEdited() {
        var status = configuration.describe(ChannelEnum.BILIBILI, Map.of("secret", "must-not-leak"));
        assertThat(status.fields()).isEmpty();
        assertThat(status.configuredSecretFields()).isEmpty();
        assertThat(status.receiveConfigured()).isFalse();
        assertThatThrownBy(() -> configuration.merge(ChannelEnum.BILIBILI, Map.of(), Map.of(), List.of(), "unused"))
            .isInstanceOf(BizException.class);
    }
}
