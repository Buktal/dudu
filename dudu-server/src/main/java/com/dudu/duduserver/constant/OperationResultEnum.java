package com.dudu.duduserver.constant;

/**
 * 操作记录的结果代码。首版仅写入 success；failure 留待失败留痕口径（决策票 #64）。
 */
public enum OperationResultEnum {

    SUCCESS("success");

    public final String code;

    OperationResultEnum(String code) {
        this.code = code;
    }
}
