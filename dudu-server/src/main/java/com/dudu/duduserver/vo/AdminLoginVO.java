package com.dudu.duduserver.vo;

/**
 * 平台登录成功结果。exp 为 token 过期时间（epoch 秒），与 JWT 载荷一致。
 */
public record AdminLoginVO(String token, Long exp, AdminDetailVO user) {
}
