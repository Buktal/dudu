package com.dudu.duduserver.channel;

/**
 * 渠道素材读取结果：成功时携带素材原始字节与渠道给出的内容类型，失败时携带渠道原始
 * 错误码与说明或调用异常说明；成功与失败由 failureReason 是否为空区分，不模拟成功。
 */
public record ChannelMediaResult(byte[] bytes, String contentType, String failureReason) {

    public static ChannelMediaResult media(byte[] bytes, String contentType) {
        return new ChannelMediaResult(bytes, contentType, null);
    }

    public static ChannelMediaResult failed(String failureReason) {
        return new ChannelMediaResult(null, null, failureReason);
    }

    public boolean succeeded() {
        return failureReason == null;
    }
}
