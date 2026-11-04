package com.dudu.duduserver.channel.douyin;

/**
 * 抖音 refreshToken 轮换产物持久化 seam：channel 包不触达渠道账号表，实现由
 * service 层提供。条件回写——库内 refreshToken 仍为本轮送审的旧值才写入新值与
 * 续期时刻（docs/research/channels/douyin.md §9.6：旧值一经使用即失效，落库
 * 须原子更新并防并发双刷），未生效返回 false 由调用方放弃本次轮换产物。
 */
public interface DouyinRefreshTokenStore {

    boolean storeIfCurrent(Long companyChannelId, String expectedRefreshToken,
        String newRefreshToken, long renewedAtMillis);
}
