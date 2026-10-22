package com.dudu.duduserver.constant;

/**
 * 全局错误码，5 位分段。HTTP 恒 200，业务语义由 code 表达。
 * <p>
 * 分段：0 成功；10001 未知；101xx 认证；11xxx 参数；12xxx 数据；13xxx 第三方。
 */
public enum ApiEnum {

    OK(0, "操作成功"),
    UNKNOWN(10001, "系统繁忙，请稍后重试"),

    // 认证段 101xx
    TOKEN_EMPTY(10101, "请先登录"),
    TOKEN_VERIFY(10102, "登录状态无效，请重新登录"),
    TOKEN_EXPIRE(10103, "登录已过期，请重新登录"),
    LOGIN_FAILED(10104, "账号或密码错误"),
    FORBIDDEN(10106, "无访问权限"),

    // 参数段 11xxx
    PARAM_ERROR(11000, "请求参数错误"),
    PARAM_MISSING(11100, "缺少必要参数"),
    PARAM_EXCEED(11200, "参数超出允许范围"),

    // 数据段 12xxx
    DATA_ERROR(12000, "数据处理失败"),
    DATA_NOT_EXIST(12100, "数据不存在"),
    DATA_NOT_ALLOW(12200, "数据状态不允许此操作"),
    DATA_EXIST(12300, "数据已存在"),
    PASSWORD_WRONG(12310, "原密码错误"),

    // 第三方段 13xxx
    REQUEST_THIRD_ERROR(13100, "请求第三方服务失败"),
    ;

    public final int code;
    public final String desc;

    ApiEnum(int code, String desc) {
        this.code = code;
        this.desc = desc;
    }
}
