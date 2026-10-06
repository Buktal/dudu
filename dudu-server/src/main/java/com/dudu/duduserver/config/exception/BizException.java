package com.dudu.duduserver.config.exception;

import cn.hutool.core.util.StrUtil;
import com.dudu.duduserver.constant.ApiEnum;

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
        super(StrUtil.blankToDefault(msg, apiEnum.desc));
        this.apiEnum = apiEnum;
    }

    public ApiEnum apiEnum() {
        return apiEnum;
    }
}
