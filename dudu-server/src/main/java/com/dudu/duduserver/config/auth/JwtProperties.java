package com.dudu.duduserver.config.auth;

import cn.hutool.core.util.StrUtil;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.Name;

/**
 * 认证配置：保留 dudu.auth.jwt-secret 外部键，默认有效期为 7 天。
 */
@ConfigurationProperties(prefix = "dudu.auth")
public record JwtProperties(@Name("jwt-secret") String secret, Long ttlSeconds) {

    private static final long DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60L;

    public JwtProperties {
        if (StrUtil.isBlank(secret)) {
            throw new IllegalStateException("dudu.auth.jwt-secret 不能为空");
        }
        if (ttlSeconds != null && ttlSeconds <= 0) {
            throw new IllegalStateException("dudu.auth.ttl-seconds 必须大于 0");
        }
        ttlSeconds = ttlSeconds == null ? DEFAULT_TTL_SECONDS : ttlSeconds;
    }
}
