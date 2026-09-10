package com.dudu.duduserver.exception;

import com.dudu.duduserver.constant.ApiEnum;

/** 参数类业务异常，默认 PARAM_ERROR。 */
public final class ParamException extends BizException {

    public ParamException(ApiEnum apiEnum) {
        this(apiEnum, null);
    }

    public ParamException(String msg) {
        this(ApiEnum.PARAM_ERROR, msg);
    }

    public ParamException(ApiEnum apiEnum, String msg) {
        super(apiEnum, msg);
    }
}
