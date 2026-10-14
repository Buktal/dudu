package com.dudu.duduserver.channel.support;

/**
 * 渠道发送/素材读取限制说明的共享文案：凭据缺失时如实告知 Desk，不编造可发可读能力。
 * 文案被各渠道 restriction 与 Desk 展示逐字依赖，调整须同步核对集成测试断言。
 */
public final class ChannelRestrictions {

    // 渠道发送凭据未配置（channel_info 缺发送侧凭据）
    public static final String SEND_CREDENTIALS_MISSING = "渠道发送凭据未配置";

    // 渠道素材凭据未配置（channel_info 缺素材侧凭据）
    public static final String MEDIA_CREDENTIALS_MISSING = "渠道素材凭据未配置";

    private ChannelRestrictions() {
    }
}
