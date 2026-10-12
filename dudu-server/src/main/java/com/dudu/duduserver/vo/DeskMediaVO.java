package com.dudu.duduserver.vo;

/**
 * Desk 媒体读取结果：渠道素材原始字节与渠道给出的内容类型，由控制器直接作为响应体返回。
 */
public record DeskMediaVO(byte[] bytes, String contentType) {
}
