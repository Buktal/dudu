package com.dudu.duduserver.config.exception;

import com.dudu.duduserver.constant.ApiEnum;

import java.util.Optional;

/**
 * 业务异常：携带 ApiEnum 错误码，服务层抛出，全局异常处理器统一转 R。
 * 构造时 msg 为空回落到枚举 desc。
 */
public final class BizException extends RuntimeException {

    private final ApiEnum apiEnum;

    public BizException(ApiEnum apiEnum) {
        this(apiEnum, null);
    }

    public BizException(ApiEnum apiEnum, String msg) {
        super(Optional.ofNullable(msg).filter(s -> !s.isBlank()).orElseGet(() -> apiEnum.desc));
        this.apiEnum = apiEnum;
    }

    public ApiEnum apiEnum() {
        return apiEnum;
    }
}
