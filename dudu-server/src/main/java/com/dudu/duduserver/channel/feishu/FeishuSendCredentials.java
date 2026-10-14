package com.dudu.duduserver.channel.feishu;

import com.dudu.duduserver.channel.support.ChannelInfoText;
import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Map;

/**
 * 飞书发送侧凭据（事实见 docs/research/channels/feishu.md §5.11、§6）：换取
 * tenant_access_token 的 appId/appSecret，文本发送与消息资源读取共用。沿用钉钉/WhatsApp
 * 先例在回调凭据之外单列发送组——verificationToken/encryptKey 只服务回调验签解密，
 * appSecret 只服务换取接口凭据，两侧互不依赖（ADR-0013：channel_info 按渠道记录收窄）。
 * 任一缺失返回 null，由适配器如实给出「渠道发送/素材凭据未配置」；凭据不写入日志也不
 * 返回给 Desk。
 */
public record FeishuSendCredentials(String appId, String appSecret) {

    private static final String INFO_APP_ID = "appId";
    private static final String INFO_APP_SECRET = "appSecret";

    public static FeishuSendCredentials of(CompanyChannelDO account) {
        Map<String, Object> info = account == null ? null : account.getChannelInfo();
        String appId = ChannelInfoText.text(info, INFO_APP_ID);
        String appSecret = ChannelInfoText.text(info, INFO_APP_SECRET);
        return appId == null || appSecret == null ? null : new FeishuSendCredentials(appId, appSecret);
    }
}
