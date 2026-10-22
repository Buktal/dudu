package com.dudu.duduserver.channel;

/**
 * 渠道回调路由单点：统一入口 {@code /api/channels/{id}/callback} 的路径模板与按账号实例化，
 * 供适配器验签拼 URL、Console 回调地址展示与拦截器放行规则共用，避免字面量多处漂移。
 */
public final class ChannelRoutes {

    // 回调路径模板：{id} 为 companyChannelId
    public static final String CALLBACK_PATH = "/api/channels/{id}/callback";

    private ChannelRoutes() {
    }

    // 按账号实例化回调路径（拦截器放行规则用 {id} 换 * 派生）
    public static String callbackPath(Long companyChannelId) {
        return CALLBACK_PATH.replace("{id}", String.valueOf(companyChannelId));
    }
}
