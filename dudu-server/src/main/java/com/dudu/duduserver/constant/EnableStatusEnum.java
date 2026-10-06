package com.dudu.duduserver.constant;

/**
 * 企业与用户共用的启停开关。数据库与接口统一 0/1，无字符串形式。
 */
public enum EnableStatusEnum {

    DISABLED(0),
    ENABLED(1);

    public final int code;

    EnableStatusEnum(int code) {
        this.code = code;
    }
}
