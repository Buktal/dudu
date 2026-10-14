package com.dudu.duduserver.channel;

/**
 * 渠道入站接收结果：response 为回调 HTTP 应答原样返回；message 非空表示解析出访客消息，
 * 由业务层落库后应答，事件推送与拒绝场景 message 为空、只应答不落库。
 */
public record ChannelReceiveResult(ChannelCallbackResult response, ChannelInboundMessage message) {

    // 只应答：拒绝、不支持、参数错误与事件推送都没有可落库的访客消息
    public static ChannelReceiveResult answer(ChannelCallbackResult response) {
        return new ChannelReceiveResult(response, null);
    }

    // 解析出访客消息：业务层落库后按 success 应答
    public static ChannelReceiveResult accept(ChannelInboundMessage message) {
        return accept(message, ChannelCallbackResult.success());
    }

    // 解析出访客消息并按渠道协议应答：钉钉等渠道要求以加密 success 包应答而非明文
    public static ChannelReceiveResult accept(ChannelInboundMessage message, ChannelCallbackResult response) {
        return new ChannelReceiveResult(response, message);
    }
}
