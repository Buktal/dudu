package com.dudu.duduserver.config.auth;

import cn.hutool.jwt.JWTUtil;
import com.dudu.duduserver.common.JwtUser;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.exception.AuthException;
import java.io.IOException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Hutool JWT 只承担签发/验签；payload 读写走 Jackson（全仓唯一 JSON 栈）。
 * 过期用标准 exp claim（epoch 秒），不进 JwtUser 业务字段。
 */
@Component
public class JwtManager {

    private final JwtProperties properties;
    private final ObjectMapper objectMapper;

    public JwtManager(JwtProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    public String createToken(JwtUser user) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("userId", user.userId());
        payload.put("role", user.role());
        payload.put("exp", Instant.now().plus(properties.jwtExpireDays(), ChronoUnit.DAYS).getEpochSecond());
        return JWTUtil.createToken(payload, properties.jwtSecret().getBytes(StandardCharsets.UTF_8));
    }

    public JwtUser parseToken(String token) {
        String raw = Optional.ofNullable(token)
                .filter(s -> !s.isBlank())
                .orElseThrow(() -> new AuthException(ApiEnum.TOKEN_EMPTY));

        if (!JWTUtil.verify(raw, properties.jwtSecret().getBytes(StandardCharsets.UTF_8))) {
            throw new AuthException(ApiEnum.TOKEN_VERIFY);
        }

        JsonNode claims = readClaims(raw);
        long exp = claims.path("exp").asLong(0);
        if (exp <= 0 || Instant.now().getEpochSecond() >= exp) {
            throw new AuthException(ApiEnum.TOKEN_EXPIRE);
        }

        try {
            return Optional.of(objectMapper.treeToValue(claims, JwtUser.class))
                    .filter(user -> user.userId() != null)
                    .orElseThrow(() -> new AuthException(ApiEnum.TOKEN_VERIFY));
        } catch (IOException e) {
            throw new AuthException(ApiEnum.TOKEN_VERIFY);
        }
    }

    private JsonNode readClaims(String token) {
        String[] parts = token.split("\\.");
        if (parts.length != 3) {
            throw new AuthException(ApiEnum.TOKEN_VERIFY);
        }
        try {
            return objectMapper.readTree(Base64.getUrlDecoder().decode(parts[1]));
        } catch (IllegalArgumentException | IOException e) {
            throw new AuthException(ApiEnum.TOKEN_VERIFY);
        }
    }
}
