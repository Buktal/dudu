package com.dudu.duduserver.channel.feishu;

import com.dudu.duduserver.channel.support.ChannelInfoText;
import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Map;

/**
 * 飞书回调凭据（事实见 docs/research/channels/feishu.md §4、§6）：从
 * company_channel.channel_info 读取 verificationToken（事件明文比对）与 encryptKey
 * （可选，空 = 明文模式，配置后签名验签与 AES 解密）；appId 是飞书应用定位符，回调与
 * 发送两侧共用故同入回调组（发送侧完整凭据见 {@link FeishuSendCredentials}）。
 * 任一必填键缺失返回 null，由调用方按「该账号未配置」处理（ADR-0013）；凭据不写入
 * 日志也不返回给 Desk。
 */
public record FeishuCredentials(String appId, String verificationToken, String encryptKey) {

    // channel_info 键名与开发者后台「凭证与基础信息 / 加密策略」页字段一一对应
    private static final String INFO_APP_ID = "appId";
    private static final String INFO_VERIFICATION_TOKEN = "verificationToken";
    private static final String INFO_ENCRYPT_KEY = "encryptKey";

    public static FeishuCredentials of(CompanyChannelDO account) {
        Map<String, Object> info = account == null ? null : account.getChannelInfo();
        String appId = ChannelInfoText.text(info, INFO_APP_ID);
        String verificationToken = ChannelInfoText.text(info, INFO_VERIFICATION_TOKEN);
        if (appId == null || verificationToken == null) {
            return null;
        }
        // encryptKey 可选：缺失即明文模式（官方 §4.1 默认低安全形态）
        return new FeishuCredentials(appId, verificationToken, ChannelInfoText.text(info, INFO_ENCRYPT_KEY));
    }
}
