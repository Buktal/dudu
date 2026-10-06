package com.dudu.duduserver.config.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Optional;

/**
 * 认证配置，前缀 dudu.auth。
 * jwt-secret 是登录 token 的 HS256 签名密钥，必须显式配置（如环境变量 DUDU_AUTH_JWT_SECRET），缺省即启动失败；
 * ttl-seconds 是登录 token 有效期（秒），缺省 24 小时，配置非正数视为配置错误，启动失败。
 */
@ConfigurationProperties(prefix = "dudu.auth")
public record JwtProperties(String jwtSecret, Long ttlSeconds) {

    // 默认 token 有效期：24 小时
    private static final long DEFAULT_TTL_SECONDS = 24 * 60 * 60L;

    // 签名密钥用于登录 token 的签发与验签，缺失或空白意味着认证体系不可用，须启动失败而非放行
    private static final String JWT_SECRET_HINT =
        "缺少登录 token 签名密钥：请配置 dudu.auth.jwt-secret（环境变量 DUDU_AUTH_JWT_SECRET）";

    // 显式配置了非法有效期（≤0）时启动失败而非静默回退，避免拼错配置被默认值掩盖
    private static final String TTL_HINT =
        "dudu.auth.ttl-seconds 必须为正数秒（缺省 " + DEFAULT_TTL_SECONDS + " 即 24 小时），当前=";

    public JwtProperties {
        jwtSecret = Optional.ofNullable(jwtSecret)
            .filter(s -> !s.isBlank())
            .orElseThrow(() -> new IllegalStateException(JWT_SECRET_HINT));
        if (ttlSeconds != null && ttlSeconds <= 0) {
            throw new IllegalStateException(TTL_HINT + ttlSeconds);
        }
        ttlSeconds = Optional.ofNullable(ttlSeconds).orElse(DEFAULT_TTL_SECONDS);
    }
}
