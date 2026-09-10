package com.dudu.duduserver.constant;

/**
 * 全局错误码，5 位分段。HTTP 恒 200，业务语义由 code 表达。
 * <p>
 * 分段：0 成功；10001 未知；101xx 认证；11xxx 参数；13xxx 数据；14xxx 第三方。
 * 业务码随业务生长，沿用 BangBu 的分段模式重编。
 */
public enum ApiEnum {

    OK(0, "成功"),
    UNKNOWN(10001, "未知异常"),

    // 认证段 101xx
    TOKEN_ERROR(10100, "Token错误"),
    TOKEN_EMPTY(10101, "Token为空"),
    TOKEN_VERIFY(10102, "Token无效"),
    TOKEN_EXPIRE(10103, "Token已过期"),

    // 参数段 11xxx
    PARAM_ERROR(11000, "参数错误"),
    PARAM_MISSING(11100, "参数缺失"),
    PARAM_EXCEED(11200, "参数超出"),

    // 数据段 13xxx
    DATA_ERROR(13000, "数据错误"),
    DATA_NOT_EXIST(13100, "数据不存在"),
    DATA_NOT_ALLOW(13200, "数据不允许"),

    // 第三方段 14xxx
    THIRD_ERROR(14000, "第三方错误"),
    REQUEST_THIRD_ERROR(14100, "请求第三方错误"),
    ;

    public final int code;
    public final String desc;

    ApiEnum(int code, String desc) {
        this.code = code;
        this.desc = desc;
    }
}
