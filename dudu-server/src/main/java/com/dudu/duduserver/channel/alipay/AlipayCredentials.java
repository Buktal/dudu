package com.dudu.duduserver.channel.alipay;

import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Map;

/**
 * 支付宝渠道凭据：从 company_channel.channel_info 读取 appId 与 appPrivateKey（键名与
 * mock-pulse config.rs Alipay 变体一致，事实见 docs/research/channels/alipay.md §3.2、附）；
 * 验签公钥由 appPrivateKey 推导（见 {@link AlipayProtocol}），channel_info 不存公钥；
 * 缺失任一返回 null（按「该账号未配置」处理），凭据不写入日志也不返回给 Desk。
 */
public record AlipayCredentials(String appId, String appPrivateKey) {

    private static final String INFO_APP_ID = "appId";
    private static final String INFO_APP_PRIVATE_KEY = "appPrivateKey";

    public static AlipayCredentials of(CompanyChannelDO account) {
        Map<String, Object> info = account == null ? null : account.getChannelInfo();
        String appId = text(info, INFO_APP_ID);
        String appPrivateKey = text(info, INFO_APP_PRIVATE_KEY);
        return appId == null || appPrivateKey == null ? null : new AlipayCredentials(appId, appPrivateKey);
    }

    private static String text(Map<String, Object> info, String key) {
        Object value = info == null ? null : info.get(key);
        return value instanceof String text && !text.isBlank() ? text : null;
    }
}
