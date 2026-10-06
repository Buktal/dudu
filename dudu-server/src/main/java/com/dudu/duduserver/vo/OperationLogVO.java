package com.dudu.duduserver.vo;

import cn.hutool.core.bean.BeanUtil;
import com.dudu.duduserver.constant.OperationActionEnum;
import com.dudu.duduserver.constant.OperationTargetEnum;
import com.dudu.duduserver.entity.OperationLogDO;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 平台操作记录视图；不含密码、哈希、令牌或原样请求体。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class OperationLogVO {

    private String operationLogId;

    private String operatorUserId;

    private String companyId;

    private OperationActionEnum action;

    private OperationTargetEnum target;

    private String targetId;

    private String summary;

    private LocalDateTime createTime;

    // 仅映射此视图声明的公开字段，保留 ID 字符串与 null 语义
    public static OperationLogVO of(OperationLogDO source) {
        return BeanUtil.toBean(source, OperationLogVO.class);
    }
}
