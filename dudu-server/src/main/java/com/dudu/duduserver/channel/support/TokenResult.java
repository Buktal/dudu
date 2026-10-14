package com.dudu.duduserver.channel.support;

/**
 * 渠道接口凭据换取结果：成功只带 accessToken，失败只带已成型的原因说明。
 * 各渠道令牌客户端共用同一形状；进程内缓存复用另见 AccessTokenCache。
 */
public record TokenResult(String accessToken, String failureReason) {

    public boolean succeeded() {
        return accessToken != null;
    }
}
