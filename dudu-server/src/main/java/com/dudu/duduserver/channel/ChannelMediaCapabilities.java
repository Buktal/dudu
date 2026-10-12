package com.dudu.duduserver.channel;

import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;

/**
 * 渠道素材读取能力规则：当前只接入微信公众号（需要 channel_info 的 appId/appSecret
 * 换取接口凭据，事实见 docs/research/channels/wechat-mp.md §6）；ChannelEnum 其余渠道
 * 与未配置凭据的账号如实给出不可读原因，不编造读取能力。
 */
public final class ChannelMediaCapabilities {

    private ChannelMediaCapabilities() {
    }

    /**
     * 当前账号可用的素材读取限制说明；null 表示可用渠道凭据读取素材。
     */
    public static String readRestriction(CompanyChannelDO account) {
        if (account == null) {
            return "渠道账号不可用";
        }
        if (account.getChannel() != ChannelEnum.WECHAT) {
            return "当前渠道暂未接入素材读取";
        }
        return WechatMpCredentials.of(account) == null ? "渠道素材凭据未配置" : null;
    }
}
