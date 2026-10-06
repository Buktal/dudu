package com.dudu.duduserver.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.dudu.duduserver.constant.OperationActionEnum;
import com.dudu.duduserver.constant.OperationTargetEnum;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 平台操作记录，只追加、不更新；禁止记录密码、哈希、令牌或原样请求体。
 */
@Data
@TableName("operation_log")
public class OperationLogDO {

    // 记录标识，自增
    @TableId(value = "operation_log_id", type = IdType.AUTO)
    private Long operationLogId;

    // 已认证的实际操作者
    private Long operatorUserId;

    // 企业操作的目标；个人账号操作为 null
    private Long companyId;

    // 操作代码，见 OperationActionEnum
    private OperationActionEnum action;

    // 目标类型，见 OperationTargetEnum
    @TableField("target_type")
    private OperationTargetEnum target;

    // 已完成操作的目标标识
    private Long targetId;

    // 可展示的非敏感结果说明
    private String summary;

    // 操作时间，只追加不更新
    @TableField(value = "create_time", fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}
