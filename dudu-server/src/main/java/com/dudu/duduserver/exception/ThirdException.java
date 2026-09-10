package com.dudu.duduserver.exception;

import com.dudu.duduserver.constant.ApiEnum;

/** 第三方类业务异常（平台 OpenAPI、验签等），默认 THIRD_ERROR。 */
public final class ThirdException extends BizException {

    public ThirdException(ApiEnum apiEnum) {
        this(apiEnum, null);
    }

    public ThirdException(String msg) {
        this(ApiEnum.THIRD_ERROR, msg);
    }

    public ThirdException(ApiEnum apiEnum, String msg) {
        super(apiEnum, msg);
    }
}
