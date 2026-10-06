package com.dudu.duduserver.constant;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 渠道平台类型，按领域术语中的平台划分，不包含 MockPulse 的回调子类型。
 */
@Getter
@RequiredArgsConstructor
public enum ChannelEnum {

    WECHAT("wechat"),
    ALIPAY("alipay"),
    DOUYIN("douyin"),
    XIAOHONGSHU("xiaohongshu"),
    BILIBILI("bilibili");

    @EnumValue
    @JsonValue
    private final String code;

    // 数据库、JSON 与查询参数共用业务代码，拒绝未知值
    @JsonCreator
    public static ChannelEnum fromCode(String code) {
        for (ChannelEnum value : values()) {
            if (value.code.equals(code)) {
                return value;
            }
        }
        throw new IllegalArgumentException("未知的ChannelEnum: " + code);
    }
}
