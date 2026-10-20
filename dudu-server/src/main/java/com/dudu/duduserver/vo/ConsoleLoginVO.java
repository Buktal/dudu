package com.dudu.duduserver.vo;

/**
 * Console 登录返回：JWT、epoch 秒过期时间及实时企业身份。
 */
public record ConsoleLoginVO(String token, Long expiresAt, ConsoleProfileVO profile) {
}
