package com.dudu.duduserver.common;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * token 中的当前用户身份。字段可扩展：解析侧忽略未知 claim，
 * 将来加 tenantId 等新字段不破坏旧 token 校验。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record JwtUser(Long userId, String role) {
}
