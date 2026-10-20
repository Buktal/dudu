package com.dudu.duduserver.util;

import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;

/**
 * Console 业务 ID 的十进制字符串边界，避免隐式接受负数或超出 Long 范围。
 */
public final class ConsoleIds {
    private ConsoleIds() {
    }

    public static Long parse(String value) {
        if (value == null || !value.matches("[1-9][0-9]*")) {
            throw new BizException(ApiEnum.PARAM_ERROR, "ID 格式错误");
        }
        try {
            return Long.valueOf(value);
        } catch (NumberFormatException e) {
            throw new BizException(ApiEnum.PARAM_ERROR, "ID 超出范围");
        }
    }
}
