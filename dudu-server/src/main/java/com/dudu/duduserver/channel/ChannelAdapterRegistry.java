package com.dudu.duduserver.channel;

import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 渠道适配器注册表：构造注入全部实现，按 channel() 建路由表；回调、回复、媒体与能力四处
 * 调用方只查这里分派，零渠道分支。查不到 = 渠道未接入，调用方按各自接口语义应答不支持，
 * 或如实给出限制说明，不编造可发可读能力。
 */
@Component
public class ChannelAdapterRegistry {

    // 未接入渠道的如实说明，与已接入渠道的凭据缺失说明区分
    private static final String ACCOUNT_UNAVAILABLE = "渠道账号不可用";
    private static final String SEND_NOT_CONNECTED = "当前渠道暂未接入发送";
    private static final String MEDIA_NOT_CONNECTED = "当前渠道暂未接入素材读取";

    private final Map<ChannelEnum, ChannelAdapter> adapters;

    public ChannelAdapterRegistry(List<ChannelAdapter> implemented) {
        this.adapters = implemented.stream()
            .collect(Collectors.toMap(ChannelAdapter::channel, Function.identity()));
    }

    // 渠道对应的适配器；null 表示未接入，回调入口按不支持应答
    public ChannelAdapter get(ChannelEnum channel) {
        return adapters.get(channel);
    }

    // 纯文本发送：未路由到已接入渠道时按限制说明如实失败
    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        String restriction = sendRestriction(account);
        if (restriction != null) {
            return ChannelSendResult.failed(restriction);
        }
        return adapters.get(account.getChannel()).send(account, externalUserId, text);
    }

    // 素材读取：未路由到已接入渠道时按限制说明如实失败
    public ChannelMediaResult readMedia(CompanyChannelDO account, String externalMediaId) {
        String restriction = mediaRestriction(account);
        if (restriction != null) {
            return ChannelMediaResult.failed(restriction);
        }
        return adapters.get(account.getChannel()).readMedia(account, externalMediaId);
    }

    // null 表示可用纯文本发送：账号缺失、渠道未接入或缺少渠道凭据时如实说明
    public String sendRestriction(CompanyChannelDO account) {
        return restriction(account, ChannelAdapter::sendRestriction, SEND_NOT_CONNECTED);
    }

    // null 表示可用渠道凭据读取素材：同上
    public String mediaRestriction(CompanyChannelDO account) {
        return restriction(account, ChannelAdapter::mediaRestriction, MEDIA_NOT_CONNECTED);
    }

    // 渠道差异由适配器回答，注册表只补足无适配器可问的两种中性情况
    private String restriction(CompanyChannelDO account, BiFunction<ChannelAdapter, CompanyChannelDO, String> check,
                               String notConnected) {
        if (account == null) {
            return ACCOUNT_UNAVAILABLE;
        }
        ChannelAdapter adapter = adapters.get(account.getChannel());
        return adapter == null ? notConnected : check.apply(adapter, account);
    }
}
