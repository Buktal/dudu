package com.dudu.duduserver.config.auth;

import com.dudu.duduserver.common.JwtUser;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.exception.AuthException;
import cn.hutool.jwt.JWTUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtManagerTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    private JwtManager manager(int expireDays) {
        return new JwtManager(new JwtProperties("test-secret", expireDays, null, null), objectMapper);
    }

    @Test
    void roundTripCarriesUserIdAndRole() {
        String token = manager(7).createToken(new JwtUser(5L, "agent"));

        JwtUser user = manager(7).parseToken(token);

        assertThat(token.split("\\.")).hasSize(3);
        assertThat(user.userId()).isEqualTo(5L);
        assertThat(user.role()).isEqualTo("agent");
    }

    @Test
    void expiredTokenThrowsTokenExpire() {
        String token = manager(-1).createToken(new JwtUser(5L, "agent"));

        assertThatThrownBy(() -> manager(-1).parseToken(token))
                .isInstanceOf(AuthException.class)
                .extracting(e -> ((AuthException) e).apiEnum())
                .isEqualTo(ApiEnum.TOKEN_EXPIRE);
    }

    @Test
    void wrongSecretThrowsTokenVerify() {
        String token = manager(7).createToken(new JwtUser(5L, "agent"));
        JwtManager other = new JwtManager(
                new JwtProperties("another-secret", 7, null, null), objectMapper);

        assertThatThrownBy(() -> other.parseToken(token))
                .isInstanceOf(AuthException.class)
                .extracting(e -> ((AuthException) e).apiEnum())
                .isEqualTo(ApiEnum.TOKEN_VERIFY);
    }

    @Test
    void blankTokenThrowsTokenEmpty() {
        assertThatThrownBy(() -> manager(7).parseToken(null))
                .isInstanceOf(AuthException.class)
                .extracting(e -> ((AuthException) e).apiEnum())
                .isEqualTo(ApiEnum.TOKEN_EMPTY);
        assertThatThrownBy(() -> manager(7).parseToken("  "))
                .isInstanceOf(AuthException.class)
                .extracting(e -> ((AuthException) e).apiEnum())
                .isEqualTo(ApiEnum.TOKEN_EMPTY);
    }

    @Test
    void unknownClaimsAreIgnoredForFutureExtension() {
        Map<String, Object> payload = new HashMap<>();
        payload.put("userId", 5L);
        payload.put("role", "agent");
        payload.put("tenantId", 42L);
        payload.put("exp", Instant.now().plusSeconds(3600).getEpochSecond());
        String token = JWTUtil.createToken(payload, "test-secret".getBytes());

        JwtUser user = manager(7).parseToken(token);

        assertThat(user.userId()).isEqualTo(5L);
        assertThat(user.role()).isEqualTo("agent");
    }
}
