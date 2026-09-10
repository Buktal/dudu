package com.dudu.duduserver.config.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;
import java.util.Optional;

/**
 * 认证配置。jwt-secret 生产必须经环境变量 DUDU_AUTH_JWT_SECRET 覆盖，缺省即启动失败。
 */
@ConfigurationProperties(prefix = "dudu.auth")
public record JwtProperties(
        String jwtSecret,
        Integer jwtExpireDays,
        List<String> whitelist,
        Boolean devTokenEnabled) {

    public JwtProperties {
        jwtSecret = Optional.ofNullable(jwtSecret)
                .filter(s -> !s.isBlank())
                .orElseThrow(() -> new IllegalStateException("dudu.auth.jwt-secret 未配置（生产用 DUDU_AUTH_JWT_SECRET 覆盖）"));
        jwtExpireDays = Optional.ofNullable(jwtExpireDays).orElse(7);
        whitelist = Optional.ofNullable(whitelist).map(List::copyOf).orElse(List.of());
        devTokenEnabled = Boolean.TRUE.equals(devTokenEnabled);
    }
}
