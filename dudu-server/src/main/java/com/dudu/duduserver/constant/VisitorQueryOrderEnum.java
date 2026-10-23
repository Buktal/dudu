package com.dudu.duduserver.constant;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * Desk 访客查询的排序方式：wait 为待回复优先，messages 为消息数降序。
 */
@Getter
@RequiredArgsConstructor
public enum VisitorQueryOrderEnum {

    WAIT("wait"),
    MESSAGES("messages");

    @JsonValue
    private final String code;

    // 接口与查询参数共用业务代码，拒绝未知值（统一由全局异常处理转为 11000）
    @JsonCreator
    public static VisitorQueryOrderEnum fromCode(String code) {
        for (VisitorQueryOrderEnum value : values()) {
            if (value.code.equals(code)) {
                return value;
            }
        }
        throw new IllegalArgumentException("未知的VisitorQueryOrderEnum: " + code);
    }
}
