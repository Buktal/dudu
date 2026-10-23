package com.dudu.duduserver.constant;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 消息方向：来访与坐席发出；数据库与接口共用业务代码，拒绝未知值。
 */
@Getter
@RequiredArgsConstructor
public enum MessageDirectionEnum {

    INCOMING("incoming"),
    OUTGOING("outgoing");

    @EnumValue
    @JsonValue
    private final String code;

    @JsonCreator
    public static MessageDirectionEnum fromCode(String code) {
        for (MessageDirectionEnum value : values()) {
            if (value.code.equals(code)) {
                return value;
            }
        }
        throw new IllegalArgumentException("未知的MessageDirectionEnum: " + code);
    }
}
