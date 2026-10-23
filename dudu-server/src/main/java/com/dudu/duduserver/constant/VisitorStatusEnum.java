package com.dudu.duduserver.constant;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

import java.util.List;

/**
 * 共享接待状态，数据库与接口使用业务代码；待回复与等待中都属于未结束的活跃接待。
 */
@Getter
@RequiredArgsConstructor
public enum VisitorStatusEnum {

    NEEDS_REPLY("needs-reply"),
    WAITING("waiting"),
    CLOSED("closed");

    // 查询筛选中的活跃态：待回复与等待中之和，不含已结束
    public static final List<VisitorStatusEnum> ACTIVE = List.of(NEEDS_REPLY, WAITING);

    @EnumValue
    @JsonValue
    private final String code;

    // 数据库、JSON 与查询参数共用业务代码，拒绝未知值
    @JsonCreator
    public static VisitorStatusEnum fromCode(String code) {
        for (VisitorStatusEnum value : values()) {
            if (value.code.equals(code)) {
                return value;
            }
        }
        throw new IllegalArgumentException("未知的VisitorStatusEnum: " + code);
    }
}
