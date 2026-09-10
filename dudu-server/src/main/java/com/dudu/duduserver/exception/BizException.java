package com.dudu.duduserver.exception;

import com.dudu.duduserver.constant.ApiEnum;

import java.util.Optional;

/**
 * 业务异常密封家族的根：子类按域归类（参数/数据/第三方/认证），
 * 全局异常处理器按家族分流日志与错误码。构造时 msg 为空回落到枚举 desc。
 */
public sealed abstract class BizException extends RuntimeException
        permits ParamException, DataException, ThirdException, AuthException {

    private final ApiEnum apiEnum;

    protected BizException(ApiEnum apiEnum, String msg) {
        super(Optional.ofNullable(msg).filter(s -> !s.isBlank()).orElseGet(() -> apiEnum.desc));
        this.apiEnum = apiEnum;
    }

    public ApiEnum apiEnum() {
        return apiEnum;
    }
}
