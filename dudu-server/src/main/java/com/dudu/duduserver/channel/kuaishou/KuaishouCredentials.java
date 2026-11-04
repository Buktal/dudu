package com.dudu.duduserver.channel.kuaishou;

import com.dudu.duduserver.channel.support.ChannelInfoText;
import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Map;

/**
 * 快手智能客服渠道凭据（事实见 docs/research/channels/kuaishou.md §6.5、§8）：从
 * company_channel.channel_info 读取 appKey（推送验签 Ks-Sign=MD5(appKey+body)、发送
 * 网关的 appkey 与 oauth2 的 app_id 同一应用标识，参数名随端点族不同）与可选
 * appSecret（oauth2 令牌端点密钥，与发送签名密钥 signSecret 是平台分配的两个值）、
 * signSecret（发送网关签名盐）、accessToken（发送网关授权令牌，默认 86400s 寿命）、
 * refreshToken（oauth2 刷新凭证，录入后由服务端每日自动轮换 accessToken）。appKey
 * 缺失即渠道未配置，返回 null；凭据不写入日志也不返回给 Desk。
 */
public record KuaishouCredentials(String appKey, String appSecret, String signSecret, String accessToken,
                                  String refreshToken) {

    private static final String INFO_APP_KEY = "appKey";
    private static final String INFO_APP_SECRET = "appSecret";
    private static final String INFO_SIGN_SECRET = "signSecret";
    private static final String INFO_ACCESS_TOKEN = "accessToken";
    private static final String INFO_REFRESH_TOKEN = "refreshToken";

    public static KuaishouCredentials of(CompanyChannelDO account) {
        Map<String, Object> info = account == null ? null : account.getChannelInfo();
        String appKey = ChannelInfoText.text(info, INFO_APP_KEY);
        if (appKey == null) {
            return null;
        }
        // 其余凭据可选：未配置仅相应能力受限（发送需令牌链，回调接收不受影响）
        return new KuaishouCredentials(appKey,
            ChannelInfoText.text(info, INFO_APP_SECRET),
            ChannelInfoText.text(info, INFO_SIGN_SECRET),
            ChannelInfoText.text(info, INFO_ACCESS_TOKEN),
            ChannelInfoText.text(info, INFO_REFRESH_TOKEN));
    }
}
