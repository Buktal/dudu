package com.dudu.duduserver.channel.alipay;

import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Map;

/**
 * 支付宝渠道凭据：从 company_channel.channel_info 读取 appId、appPrivateKey 与
 * alipayPublicKey（appId/appPrivateKey 键名与 mock-pulse config.rs Alipay 变体一致，
 * alipayPublicKey 为回调验签扩展，事实见 docs/research/channels/alipay.md §3.2、§4.3）：
 * 回调验签按官方用支付宝平台公钥（应用私钥推导的公钥只作握手回包的开发者公钥），
 * 应用私钥用于请求加签与握手回包签名；缺失任一返回 null（按「该账号未配置」处理），
 * 凭据不写入日志也不返回给 Desk。
 */
public record AlipayCredentials(String appId, String appPrivateKey, String alipayPublicKey) {

    private static final String INFO_APP_ID = "appId";
    private static final String INFO_APP_PRIVATE_KEY = "appPrivateKey";
    private static final String INFO_ALIPAY_PUBLIC_KEY = "alipayPublicKey";

    public static AlipayCredentials of(CompanyChannelDO account) {
        Map<String, Object> info = account == null ? null : account.getChannelInfo();
        String appId = text(info, INFO_APP_ID);
        String appPrivateKey = text(info, INFO_APP_PRIVATE_KEY);
        String alipayPublicKey = text(info, INFO_ALIPAY_PUBLIC_KEY);
        return appId == null || appPrivateKey == null || alipayPublicKey == null
            ? null
            : new AlipayCredentials(appId, appPrivateKey, alipayPublicKey);
    }

    private static String text(Map<String, Object> info, String key) {
        Object value = info == null ? null : info.get(key);
        return value instanceof String text && !text.isBlank() ? text : null;
    }
}
