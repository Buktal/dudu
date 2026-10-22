package com.dudu.duduserver.channel.support;

import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.constant.MessageDirectionEnum;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.BiFunction;

/**
 * 微信协议族（公众号/小程序）推送解析共用骨架：事件推送返回空表示只应答不保存；
 * 缺少发送方身份抛 {@link IllegalArgumentException} 由调用方按参数错误拒绝；
 * 其余普通消息按契约第 4 节组装统一消息体。字段提取与 MsgType 内容映射是渠道真实
 * 差异，由各渠道 Protocol 提供入口与本处的映射函数。
 */
public final class WechatInboundMessages {

    // 事件推送不产生访客消息，只由调用方应答
    private static final String MSG_TYPE_EVENT = "event";

    private WechatInboundMessages() {
    }

    /**
     * 从已提取的报文字段解析统一入站消息；content 给出各渠道按 MsgType 的内容映射。
     */
    public static Optional<ChannelInboundMessage> parse(Long companyChannelId, Map<String, String> fields,
                                                        BiFunction<String, Map<String, String>, Map<String, Object>> content) {
        String msgType = fields.getOrDefault("MsgType", "");
        if (MSG_TYPE_EVENT.equals(msgType)) {
            return Optional.empty();
        }
        String externalUserId = fields.getOrDefault("FromUserName", "");
        if (externalUserId.isEmpty()) {
            throw new IllegalArgumentException("渠道报文缺少发送方身份");
        }
        ChannelInboundMessage inbound = new ChannelInboundMessage(
            companyChannelId,
            externalUserId,
            null,
            null,
            List.of(),
            Texts.blankToNull(fields.get("MsgId")),
            MessageDirectionEnum.INCOMING,
            content.apply(msgType, fields));
        return Optional.of(inbound);
    }
}
