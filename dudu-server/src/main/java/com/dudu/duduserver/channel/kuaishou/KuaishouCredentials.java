package com.dudu.duduserver.channel.kuaishou;

import com.dudu.duduserver.channel.support.ChannelInfoText;
import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Map;

/**
 * 快手智能客服渠道凭据（事实见 docs/research/channels/kuaishou.md §6.5）：从
 * company_channel.channel_info 读取 appKey（推送验签 Ks-Sign=MD5(appKey+body) 与发送
 * 网关的 appkey 参数同一应用标识）与可选 signSecret、accessToken（发送网关签名与
 * 授权令牌，§4.3——发送侧专属，未配置不影响回调接收）。appKey 缺失即渠道未配置，
 * 返回 null；凭据不写入日志也不返回给 Desk。
 */
public record KuaishouCredentials(String appKey, String signSecret, String accessToken) {

    private static final String INFO_APP_KEY = "appKey";
    private static final String INFO_SIGN_SECRET = "signSecret";
    private static final String INFO_ACCESS_TOKEN = "accessToken";

    public static KuaishouCredentials of(CompanyChannelDO account) {
        Map<String, Object> info = account == null ? null : account.getChannelInfo();
        String appKey = ChannelInfoText.text(info, INFO_APP_KEY);
        if (appKey == null) {
            return null;
        }
        // signSecret/accessToken 可选：未配置仅发送受限，回调接收不受影响
        return new KuaishouCredentials(appKey,
            ChannelInfoText.text(info, INFO_SIGN_SECRET), ChannelInfoText.text(info, INFO_ACCESS_TOKEN));
    }
}
