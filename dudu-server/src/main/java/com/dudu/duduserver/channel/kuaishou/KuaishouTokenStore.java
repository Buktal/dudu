package com.dudu.duduserver.channel.kuaishou;

/**
 * 快手 oauth2 轮换产物持久化 seam：channel 包不触达渠道账号表，实现由 service 层
 * 提供。条件回写——库内 refreshToken 仍为本轮送审的旧值才写入新 accessToken 与
 * refreshToken 及刷新时刻（docs/research/channels/kuaishou.md §8：refresh_token
 * 每次刷新轮换，旧值随轮换失效，落库须原子更新防并发双刷），未生效返回 false
 * 由调用方放弃本次轮换产物。
 */
public interface KuaishouTokenStore {

    boolean storeIfCurrent(Long companyChannelId, String expectedRefreshToken,
        String newAccessToken, String newRefreshToken, long refreshedAtMillis);
}
