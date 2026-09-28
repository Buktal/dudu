package com.dudu.duduserver.config.auth;

import cn.hutool.core.date.DateUtil;
import cn.hutool.json.JSONUtil;
import cn.hutool.jwt.JWT;
import cn.hutool.jwt.JWTUtil;
import cn.hutool.jwt.signers.JWTSignerUtil;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.config.exception.BizException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtManagerTest {

    private JwtManager manager() {
        return new JwtManager(new JwtProperties("test-secret"));
    }

    @Test
    void roundTripCarriesAllUserFields() {
        JwtUser expected = new JwtUser(5L, "agent", DateUtil.currentSeconds() + 3600);
        String token = manager().createToken(expected);

        JwtUser user = manager().parseToken(token);

        assertThat(token.split("\\.")).hasSize(3);
        assertThat(user).isEqualTo(expected);
    }

    @Test
    void concurrentRequestsKeepTheirOwnSigningState() throws Exception {
        JwtManager manager = manager();
        long exp = DateUtil.currentSeconds() + 3600;
        var tasks = IntStream.range(1, 101).mapToObj(id -> (Callable<JwtUser>) () -> {
            JwtUser user = new JwtUser((long) id, "agent", exp);
            return manager.parseToken(manager.createToken(user));
        }).toList();

        try (var executor = Executors.newFixedThreadPool(4)) {
            var results = executor.invokeAll(tasks);
            for (int i = 0; i < results.size(); i++) {
                assertThat(results.get(i).get()).isEqualTo(new JwtUser((long) i + 1, "agent", exp));
            }
        }
    }

    @Test
    void expiredTokenThrowsTokenExpire() {
        String token = manager().createToken(new JwtUser(5L, "agent", DateUtil.currentSeconds() - 60));

        assertThatThrownBy(() -> manager().parseToken(token))
                .isInstanceOf(BizException.class)
                .extracting(e -> ((BizException) e).apiEnum())
                .isEqualTo(ApiEnum.TOKEN_EXPIRE);
    }

    @Test
    void wrongSecretThrowsTokenVerify() {
        String token = manager().createToken(new JwtUser(5L, "agent", DateUtil.currentSeconds() + 3600));
        JwtManager other = new JwtManager(new JwtProperties("another-secret"));

        assertThatThrownBy(() -> other.parseToken(token))
                .isInstanceOf(BizException.class)
                .extracting(e -> ((BizException) e).apiEnum())
                .isEqualTo(ApiEnum.TOKEN_VERIFY);
    }

    @Test
    void blankTokenThrowsTokenEmpty() {
        assertThatThrownBy(() -> manager().parseToken(null))
                .isInstanceOf(BizException.class)
                .extracting(e -> ((BizException) e).apiEnum())
                .isEqualTo(ApiEnum.TOKEN_EMPTY);
        assertThatThrownBy(() -> manager().parseToken("  "))
                .isInstanceOf(BizException.class)
                .extracting(e -> ((BizException) e).apiEnum())
                .isEqualTo(ApiEnum.TOKEN_EMPTY);
    }

    @Test
    void unknownClaimsAreIgnoredForFutureExtension() {
        JwtUser expected = new JwtUser(5L, "agent", DateUtil.currentSeconds() + 3600);
        String token = JWTUtil.createToken(JSONUtil.parseObj(expected).set("tenantId", 42L),
                "test-secret".getBytes(StandardCharsets.UTF_8));

        JwtUser user = manager().parseToken(token);

        assertThat(user).isEqualTo(expected);
    }

    @ParameterizedTest
    @ValueSource(strings = {"not-a-jwt", "YmFkLWpzb24.e30.x", "eyJhbGciOjEyM30.e30.x", "eyJhbGciOiJub25lIn0.e30."})
    void malformedAndUnsignedTokensMapToTokenVerify(String token) {
        assertThatThrownBy(() -> manager().parseToken(token))
                .isInstanceOf(BizException.class)
                .extracting(e -> ((BizException) e).apiEnum())
                .isEqualTo(ApiEnum.TOKEN_VERIFY);
    }

    @Test
    void otherSigningAlgorithmIsRejected() {
        String token = JWT.create()
                .addPayloads(JSONUtil.parseObj(new JwtUser(5L, "agent", DateUtil.currentSeconds() + 3600)))
                .setSigner(JWTSignerUtil.hs512("test-secret".getBytes(StandardCharsets.UTF_8)))
                .sign();

        assertThatThrownBy(() -> manager().parseToken(token))
                .isInstanceOf(BizException.class)
                .extracting(e -> ((BizException) e).apiEnum())
                .isEqualTo(ApiEnum.TOKEN_VERIFY);
    }

    @Test
    void missingIdentityIsRejected() {
        String token = manager().createToken(new JwtUser(null, "agent", DateUtil.currentSeconds() + 3600));

        assertThatThrownBy(() -> manager().parseToken(token))
                .isInstanceOf(BizException.class)
                .extracting(e -> ((BizException) e).apiEnum())
                .isEqualTo(ApiEnum.TOKEN_VERIFY);
    }

    @Test
    void missingExpiryIsRejected() {
        String token = manager().createToken(new JwtUser(5L, "agent", null));

        assertThatThrownBy(() -> manager().parseToken(token))
                .isInstanceOf(BizException.class)
                .extracting(e -> ((BizException) e).apiEnum())
                .isEqualTo(ApiEnum.TOKEN_EXPIRE);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "Bearer ", "Bearer    ", "Basic abc", "abc"})
    void missingBearerCredentialsAreRejected(String authorization) {
        assertThatThrownBy(() -> manager().parseAuthorization(authorization))
                .isInstanceOf(BizException.class)
                .extracting(e -> ((BizException) e).apiEnum())
                .isEqualTo(ApiEnum.TOKEN_EMPTY);
    }
}
