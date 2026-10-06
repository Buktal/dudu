package com.dudu.duduserver.util;

import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;

import java.util.regex.Pattern;

/**
 * 企业 ID 规则：严格 100000–999999 六位数字，创建前选定，创建后固定、不回收。
 * 正则 [1-9]\d{5} 与数值范围一一对应，首位为 0 的补零写法非法。
 */
public final class CompanyIdPolicy {

    public static final long MIN = 100000L;
    public static final long MAX = 999999L;

    // 六位数字且首位 1-9，等价于 100000–999999；字符串常量供校验注解引用
    public static final String PATTERN_STR = "[1-9]\\d{5}";
    public static final Pattern PATTERN = Pattern.compile(PATTERN_STR);

    private CompanyIdPolicy() {
    }

    // 判断字符串是否为合法企业 ID
    public static boolean isValid(String companyId) {
        return companyId != null && PATTERN.matcher(companyId).matches();
    }

    // 解析合法企业 ID 为 Long；非法输入抛参数错误
    public static Long parseCompanyId(String companyId) {
        if (!isValid(companyId)) {
            throw new BizException(ApiEnum.PARAM_ERROR, "企业 ID 必须为 100000–999999 的六位数字");
        }
        return Long.valueOf(companyId);
    }
}
