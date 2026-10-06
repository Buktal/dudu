package com.dudu.duduserver.common;

import com.dudu.duduserver.constant.ApiEnum;

/**
 * 统一返回体。HTTP 恒 200，业务语义由 code 表达，错误详情见 {@link ApiEnum} 分段。
 */
public record R<T>(Integer code, String msg, T data) {

    public static R<Void> ok() {
        return new R<>(ApiEnum.OK.code, ApiEnum.OK.desc, null);
    }

    public static <T> R<T> ok(T data) {
        return new R<>(ApiEnum.OK.code, ApiEnum.OK.desc, data);
    }

    public static R<Void> err(ApiEnum apiEnum) {
        return new R<>(apiEnum.code, apiEnum.desc, null);
    }

    public static R<Void> err(ApiEnum apiEnum, String msg) {
        return new R<>(apiEnum.code, msg, null);
    }
}
