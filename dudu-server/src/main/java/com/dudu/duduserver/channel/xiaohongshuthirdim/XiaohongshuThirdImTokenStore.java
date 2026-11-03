package com.dudu.duduserver.channel.xiaohongshuthirdim;

/**
 * 小红书私信三方令牌轮换产物持久化 seam（模式同抖音回复上下文 seam）：刷新接口每次
 * 轮换双 token，且旧 token 在新 token 产出 5 分钟后失效（docs/research/channels/
 * xiaohongshu.md §13.4）——轮换产物必须回写 channel_info，否则进程重启后丢失
 * refresh_token 即失去 30 天续期能力，只能重新人工授权。channel 包不触达渠道账号表，
 * 实现由 service 层提供。
 */
public interface XiaohongshuThirdImTokenStore {

    // 轮换出的新双 token 回写 channel_info 的 accessToken/refreshToken 键；账号不存在
    // 或落库未生效抛 IllegalStateException，由调用方按刷新失败处理促重试
    void store(Long companyChannelId, String accessToken, String refreshToken);
}
