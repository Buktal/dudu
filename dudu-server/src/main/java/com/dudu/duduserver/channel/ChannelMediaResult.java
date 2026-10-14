package com.dudu.duduserver.channel;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/**
 * 渠道素材读取结果：成功时携带素材原始字节与渠道给出的内容类型，失败时携带渠道原始
 * 错误码与说明或调用异常说明；成功与失败由 failureReason 是否为空区分，不模拟成功。
 */
public record ChannelMediaResult(byte[] bytes, String contentType, String failureReason) {

    public static ChannelMediaResult media(byte[] bytes, String contentType) {
        return new ChannelMediaResult(bytes, contentType, null);
    }

    // 渠道响应直取素材：字节缺失按空数组，内容类型缺失或无法使用按二进制流返回，
    // 不猜具体格式；各渠道读取端原各自维护的兜底口径收敛于此
    public static ChannelMediaResult media(ResponseEntity<byte[]> response) {
        byte[] body = response.getBody() == null ? new byte[0] : response.getBody();
        MediaType contentType = response.getHeaders().getContentType();
        return media(body, contentType == null
            ? MediaType.APPLICATION_OCTET_STREAM_VALUE : contentType.toString());
    }

    public static ChannelMediaResult failed(String failureReason) {
        return new ChannelMediaResult(null, null, failureReason);
    }

    public boolean succeeded() {
        return failureReason == null;
    }
}
