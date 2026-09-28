package com.dudu.duduserver.config.auth;

/**
 * token 的强类型载荷，Controller 通过 @Me 获取；新增载荷字段直接扩展此类型。
 * exp 为过期时间（epoch 秒），序列化即标准 exp claim。
 */
public record JwtUser(Long userId, String role, Long exp) {
}
