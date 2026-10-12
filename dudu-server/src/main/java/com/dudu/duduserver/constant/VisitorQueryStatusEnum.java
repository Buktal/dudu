package com.dudu.duduserver.constant;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

import java.util.Arrays;

/**
 * Desk 访客查询的状态筛选：active 为未结束的接待（待回复加等待中），all 不筛选状态，
 * 其余三个值精确匹配共享接待状态。
 */
@Getter
@RequiredArgsConstructor
public enum VisitorQueryStatusEnum {

    ACTIVE("active"),
    ALL("all"),
    NEEDS_REPLY("needs-reply"),
    WAITING("waiting"),
    CLOSED("closed");

    @JsonValue
    private final String code;

    // 接口与查询参数共用业务代码，拒绝未知值（统一由全局异常处理转为 11000）
    @JsonCreator
    public static VisitorQueryStatusEnum fromCode(String code) {
        return Arrays.stream(values())
            .filter(value -> value.code.equals(code))
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("未知的VisitorQueryStatusEnum: " + code));
    }
}
