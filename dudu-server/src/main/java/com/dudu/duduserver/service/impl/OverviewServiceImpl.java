package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.entity.ChannelAccountDO;
import com.dudu.duduserver.entity.CompanyDO;
import com.dudu.duduserver.entity.ReceptionGroupDO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.service.*;
import com.dudu.duduserver.util.CompanyIdPolicy;
import com.dudu.duduserver.vo.CompanyVO;
import com.dudu.duduserver.vo.OverviewVO;
import com.dudu.duduserver.vo.ResourceSummaryVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 运营概览与企业资源汇总实现。
 */
@Service
@RequiredArgsConstructor
public class OverviewServiceImpl implements OverviewService {

    // 近期开通时间窗与最近创建企业条数（首版默认，决策票 #64 收敛后如另有结论再调整）
    private static final int RECENT_DAYS = 7;
    private static final int RECENT_COMPANY_LIMIT = 10;

    private final CompanyService companyService;
    private final UserService userService;
    private final ReceptionGroupService receptionGroupService;
    private final ChannelAccountService channelAccountService;

    @Override
    public OverviewVO overview() {
        long total = companyService.count();
        long enabled = companyService.count(new LambdaQueryWrapper<CompanyDO>()
            .eq(CompanyDO::getStatus, EnableStatusEnum.ENABLED.code));
        long recentCount = companyService.count(new LambdaQueryWrapper<CompanyDO>()
            .ge(CompanyDO::getCreateTime, LocalDateTime.now().minusDays(RECENT_DAYS)));

        Page<CompanyDO> recentPage = companyService.lambdaQuery()
            .orderByDesc(CompanyDO::getCreateTime)
            .orderByDesc(CompanyDO::getCompanyId)
            .page(new Page<>(1, RECENT_COMPANY_LIMIT, false));
        List<CompanyVO> recent = recentPage.getRecords().stream().map(CompanyVO::of).toList();

        return new OverviewVO(total, enabled, total - enabled, recentCount, recent);
    }

    @Override
    public ResourceSummaryVO resourceSummary(String companyId) {
        Long id = CompanyIdPolicy.parseValid(companyId);
        if (companyService.getById(id) == null) {
            throw new BizException(ApiEnum.DATA_NOT_EXIST, "企业不存在");
        }
        long employeeCount = userService.count(new LambdaQueryWrapper<UserDO>()
            .eq(UserDO::getCompanyId, id));
        long enabledEmployeeCount = userService.count(new LambdaQueryWrapper<UserDO>()
            .eq(UserDO::getCompanyId, id)
            .eq(UserDO::getStatus, EnableStatusEnum.ENABLED.code));
        long groupCount = receptionGroupService.count(new LambdaQueryWrapper<ReceptionGroupDO>()
            .eq(ReceptionGroupDO::getCompanyId, id));
        long channelAccountCount = channelAccountService.count(new LambdaQueryWrapper<ChannelAccountDO>()
            .eq(ChannelAccountDO::getCompanyId, id));
        return new ResourceSummaryVO(String.valueOf(id), employeeCount, enabledEmployeeCount,
            groupCount, channelAccountCount);
    }
}
