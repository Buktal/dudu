package com.dudu.duduserver.channel.support;

/**
 * 渠道 HTTP 响应体的 JSON 形态判定：跳过空白后以首字节是否 {@code {} 区分 JSON
 * 报文（错误报文或视频下载地址等）与二进制素材体，供各渠道素材读取共用。
 */
public final class JsonBodies {

    private JsonBodies() {
    }

    public static boolean isJson(byte[] body) {
        for (byte value : body) {
            if (Character.isWhitespace(value)) {
                continue;
            }
            return value == '{';
        }
        return false;
    }
}
