package com.dudu.duduserver.exception;

import com.dudu.duduserver.constant.ApiEnum;

/** 数据类业务异常，默认 DATA_ERROR。 */
public final class DataException extends BizException {

    public DataException(ApiEnum apiEnum) {
        this(apiEnum, null);
    }

    public DataException(String msg) {
        this(ApiEnum.DATA_ERROR, msg);
    }

    public DataException(ApiEnum apiEnum, String msg) {
        super(apiEnum, msg);
    }
}
