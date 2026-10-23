package com.dudu.duduserver.constant;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 坐席发出消息的发送结果：调用未返回为发送中，调用成功为已发送，失败保存实际原因；
 * 其他方向的消息不写该列。
 */
@Getter
@RequiredArgsConstructor
public enum MessageSendStatusEnum {

    SENDING("sending"),
    SENT("sent"),
    FAILED("failed");

    @EnumValue
    @JsonValue
    private final String code;

    @JsonCreator
    public static MessageSendStatusEnum fromCode(String code) {
        for (MessageSendStatusEnum value : values()) {
            if (value.code.equals(code)) {
                return value;
            }
        }
        throw new IllegalArgumentException("未知的MessageSendStatusEnum: " + code);
    }
}
