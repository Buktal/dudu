package com.dudu.duduserver.constant;

/**
 * 操作记录的目标类型代码。
 */
public enum TargetTypeEnum {

    COMPANY("company"),
    USER("user");

    public final String code;

    TargetTypeEnum(String code) {
        this.code = code;
    }
}
