package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.spring.service.impl.ServiceImpl;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.config.response.P;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.OperationActionEnum;
import com.dudu.duduserver.constant.OperationResultEnum;
import com.dudu.duduserver.constant.TargetTypeEnum;
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
                              TargetTypeEnum targetType, Long targetId, String summary) {
        OperationLogDO logEntry = new OperationLogDO();
        logEntry.setOperatorUserId(operatorUserId);
        logEntry.setCompanyId(companyId);
        logEntry.setAction(action.code);
        logEntry.setTargetType(targetType.code);
        logEntry.setTargetId(targetId);
        logEntry.setResult(OperationResultEnum.SUCCESS.code);
        logEntry.setSummary(summary);
        save(logEntry);
    }

    @Override
    public P<OperationLogVO> list(OperationLogQuery query) {
        LambdaQueryWrapper<OperationLogDO> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getCompanyId())) {
            wrapper.eq(OperationLogDO::getCompanyId, CompanyIdPolicy.parseValid(query.getCompanyId()));
        }
        if (StringUtils.hasText(query.getAction())) {
            OperationActionEnum action = OperationActionEnum.ofCode(query.getAction());
            if (action == null) {
                throw new BizException(ApiEnum.PARAM_ERROR, "未知的操作类型");
            }
            wrapper.eq(OperationLogDO::getAction, action.code);
        }
        if (StringUtils.hasText(query.getResult())) {
            wrapper.eq(OperationLogDO::getResult, query.getResult());
        }
        wrapper.orderByDesc(OperationLogDO::getCreateTime).orderByDesc(OperationLogDO::getOperationLogId);

        // 先计数供 P 钳位页码（超出总页数取最后一页），分页查询本身不再重复计数
        long total = count(wrapper);
        Page<OperationLogDO> result = page(P.page(query, total), wrapper);
        result.setTotal(total);
        List<OperationLogVO> views = result.getRecords().stream().map(OperationLogVO::of).toList();
        return P.ok(result, views);
    }
}
