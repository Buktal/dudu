package com.dudu.duduserver.vo;

import com.dudu.duduserver.entity.OperationLogDO;

import java.time.LocalDateTime;

/**
 * 平台操作记录视图；不含密码、哈希、令牌或原样请求体。
 */
public record OperationLogVO(
    String operationLogId,
    String operatorUserId,
    String companyId,
    String action,
    String targetType,
    String targetId,
    String result,
    String summary,
    LocalDateTime createTime) {

    // 由操作记录实体映射，业务 ID 统一十进制字符串（数据契约）
    public static OperationLogVO of(OperationLogDO logEntry) {
        return new OperationLogVO(
            String.valueOf(logEntry.getOperationLogId()),
            String.valueOf(logEntry.getOperatorUserId()),
            logEntry.getCompanyId() == null ? null : String.valueOf(logEntry.getCompanyId()),
            logEntry.getAction(),
            logEntry.getTargetType(),
            logEntry.getTargetId() == null ? null : String.valueOf(logEntry.getTargetId()),
            logEntry.getResult(),
            logEntry.getSummary(),
            logEntry.getCreateTime());
    }
}
