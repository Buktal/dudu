package com.dudu.duduserver.service;

import com.baomidou.mybatisplus.spring.service.IService;
import com.dudu.duduserver.config.response.P;
import com.dudu.duduserver.constant.OperationActionEnum;
import com.dudu.duduserver.constant.TargetTypeEnum;
import com.dudu.duduserver.dto.OperationLogQuery;
import com.dudu.duduserver.entity.OperationLogDO;
import com.dudu.duduserver.vo.OperationLogVO;

/**
 * 平台操作记录服务：只追加成功操作（失败留痕待决策票 #64），查询按时间倒序分页。
 */
public interface OperationLogService extends IService<OperationLogDO> {

    // 追加一条成功操作记录；与业务操作同事务提交
    void appendSuccess(Long operatorUserId, Long companyId, OperationActionEnum action,
                       TargetTypeEnum targetType, Long targetId, String summary);

    // 按目标企业、动作与结果查询操作记录
    P<OperationLogVO> list(OperationLogQuery query);
}
