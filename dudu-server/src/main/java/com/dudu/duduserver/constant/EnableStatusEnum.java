package com.dudu.duduserver.constant;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 企业与用户共用的启停状态，数据库与接口使用 0/1。
 */
@Getter
@RequiredArgsConstructor
public enum EnableStatusEnum {

    DISABLED(0),
    ENABLED(1);

    @EnumValue
    @JsonValue
    private final Integer code;

    // 数据库、JSON 与查询参数共用业务代码，拒绝未知值
    @JsonCreator
    public static EnableStatusEnum fromCode(Integer code) {
        for (EnableStatusEnum value : values()) {
            if (value.code.equals(code)) {
                return value;
            }
        }
        throw new IllegalArgumentException("未知的EnableStatusEnum: " + code);
    }
}
