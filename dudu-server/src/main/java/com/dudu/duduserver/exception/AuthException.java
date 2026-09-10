package com.dudu.duduserver.exception;

import com.dudu.duduserver.constant.ApiEnum;

/** 认证类业务异常（Token 空/无效/过期），默认 TOKEN_ERROR。 */
public final class AuthException extends BizException {

    public AuthException(ApiEnum apiEnum) {
        this(apiEnum, null);
    }

    public AuthException(String msg) {
        this(ApiEnum.TOKEN_ERROR, msg);
    }

    public AuthException(ApiEnum apiEnum, String msg) {
        super(apiEnum, msg);
    }
}
