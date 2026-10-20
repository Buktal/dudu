package com.dudu.duduserver.dto;

import com.fasterxml.jackson.annotation.JsonAnySetter;

/**
 * Console 请求白名单：未知属性不绑定、不静默忽略，错误不包含属性值或凭据。
 */
public interface ConsoleRequest {
    @JsonAnySetter
    default void rejectUnknown(String key, Object value) {
        throw new IllegalArgumentException("请求包含未声明字段");
    }
}
