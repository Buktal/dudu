package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.spring.service.impl.ServiceImpl;
import com.dudu.duduserver.common.P;
import com.dudu.duduserver.constant.OperationActionEnum;
import com.dudu.duduserver.dto.OperationLogQuery;
import com.dudu.duduserver.entity.OperationLogDO;
import com.dudu.duduserver.mapper.OperationLogMapper;
import com.dudu.duduserver.service.OperationLogService;
import com.dudu.duduserver.util.CompanyIdPolicy;
import com.dudu.duduserver.vo.OperationLogVO;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;

/**
 * 平台操作记录服务实现，SQL 全部经 MyBatis-Plus 通用能力与 Lambda 构造器表达。
 */
@Service
public class OperationLogServiceImpl extends ServiceImpl<OperationLogMapper, OperationLogDO>
    implements OperationLogService {

    @Override
    public void appendSuccess(Long operatorUserId, Long companyId, OperationActionEnum action,
                              Long targetId, String summary) {
        OperationLogDO logEntry = new OperationLogDO();
        logEntry.setOperatorUserId(operatorUserId);
        logEntry.setCompanyId(companyId);
        logEntry.setAction(action);
        logEntry.setTarget(action.getTarget());
        logEntry.setTargetId(targetId);
        logEntry.setSummary(summary);
        save(logEntry);
    }

    @Override
    public P<OperationLogVO> list(OperationLogQuery query) {
        LambdaQueryWrapper<OperationLogDO> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getCompanyId())) {
            wrapper.eq(OperationLogDO::getCompanyId, CompanyIdPolicy.parseCompanyId(query.getCompanyId()));
        }
        if (query.getAction() != null) {
            wrapper.eq(OperationLogDO::getAction, query.getAction());
        }
        wrapper.orderByDesc(OperationLogDO::getCreateTime).orderByDesc(OperationLogDO::getOperationLogId);

        // 先计数供 P 钳位页码（超出总页数取最后一页），分页查询本身不再重复计数
        long total = count(wrapper);
        Page<OperationLogDO> result = query.toPage(total);
        if (total > 0) {
            result = page(result, wrapper);
        }
        result.setTotal(total);
        List<OperationLogVO> views = result.getRecords().stream().map(OperationLogVO::of).toList();
        return P.ok(result, views);
    }
}
