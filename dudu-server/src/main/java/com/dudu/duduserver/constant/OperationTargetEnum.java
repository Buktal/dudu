package com.dudu.duduserver.constant;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 操作记录的目标类型，由操作动作决定。
 */
@Getter
@RequiredArgsConstructor
public enum OperationTargetEnum {

    COMPANY("company"),
    USER("user");

    @EnumValue
    @JsonValue
    private final String code;

    // 数据库、JSON 与查询参数共用业务代码，拒绝未知值
    @JsonCreator
    public static OperationTargetEnum fromCode(String code) {
        for (OperationTargetEnum value : values()) {
            if (value.code.equals(code)) {
                return value;
            }
        }
        throw new IllegalArgumentException("未知的OperationTargetEnum: " + code);
    }
}
