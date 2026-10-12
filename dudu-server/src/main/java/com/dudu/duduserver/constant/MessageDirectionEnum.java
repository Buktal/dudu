package com.dudu.duduserver.constant;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

import java.util.Arrays;

/**
 * 消息方向：来访、坐席发出与系统消息；数据库与接口共用业务代码，拒绝未知值。
 */
@Getter
@RequiredArgsConstructor
public enum MessageDirectionEnum {

    INCOMING("incoming"),
    OUTGOING("outgoing"),
    SYSTEM("system");

    @EnumValue
    @JsonValue
    private final String code;

    @JsonCreator
    public static MessageDirectionEnum fromCode(String code) {
        return Arrays.stream(values())
            .filter(value -> value.code.equals(code))
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("未知的MessageDirectionEnum: " + code));
    }
}
