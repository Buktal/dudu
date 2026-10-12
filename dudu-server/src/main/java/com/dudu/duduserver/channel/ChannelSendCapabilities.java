package com.dudu.duduserver.channel;

import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;

/**
 * 渠道发送能力规则：当前只接入微信公众号客服消息（需要 channel_info 的 appId/appSecret，
 * 事实见 docs/research/channels/wechat-mp.md §2.7、§6）；ChannelEnum 其余渠道与未配置
 * 凭据的账号如实给出不可发原因，不编造可发能力。
 */
public final class ChannelSendCapabilities {

    private ChannelSendCapabilities() {
    }

    /**
     * 当前账号可用的发送限制说明；null 表示可用纯文本发送。
     */
    public static String sendRestriction(CompanyChannelDO account) {
        if (account == null) {
            return "渠道账号不可用";
        }
        if (account.getChannel() != ChannelEnum.WECHAT) {
            return "当前渠道暂未接入发送";
        }
        return WechatMpSendCredentials.of(account) == null ? "渠道发送凭据未配置" : null;
    }
}
