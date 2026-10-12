package com.dudu.duduserver.channel;

/**
 * 渠道发送结果：成功时携带渠道给出的消息标识（渠道不返回时为空），失败时携带渠道原始
 * 错误码与说明或调用异常说明；成功与失败由 failureReason 是否为空区分，不模拟成功。
 */
public record ChannelSendResult(String externalMessageId, String failureReason) {

    public static ChannelSendResult sent(String externalMessageId) {
        return new ChannelSendResult(externalMessageId, null);
    }

    public static ChannelSendResult failed(String failureReason) {
        return new ChannelSendResult(null, failureReason);
    }

    public boolean succeeded() {
        return failureReason == null;
    }
}
