package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.entity.CompanyDO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.entity.UserGroupDO;
import com.dudu.duduserver.service.*;
import com.dudu.duduserver.util.CompanyIdPolicy;
import com.dudu.duduserver.vo.AdminOverviewVO;
import com.dudu.duduserver.vo.CompanyResourceSummaryVO;
import com.dudu.duduserver.vo.CompanyVO;
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
    private final UserGroupService userGroupService;
    private final CompanyChannelService companyChannelService;

    @Override
    public AdminOverviewVO getOverview() {
        long total = companyService.count();
        long enabled = companyService.count(new LambdaQueryWrapper<CompanyDO>()
            .eq(CompanyDO::getStatus, EnableStatusEnum.ENABLED));
        long recentCount = companyService.count(new LambdaQueryWrapper<CompanyDO>()
            .ge(CompanyDO::getCreateTime, LocalDateTime.now().minusDays(RECENT_DAYS)));

        Page<CompanyDO> recentPage = companyService.lambdaQuery()
            .orderByDesc(CompanyDO::getCreateTime)
            .orderByDesc(CompanyDO::getCompanyId)
            .page(new Page<>(1, RECENT_COMPANY_LIMIT, false));
        List<CompanyVO> recent = recentPage.getRecords().stream().map(CompanyVO::of).toList();

        return new AdminOverviewVO(total, enabled, total - enabled, recentCount, recent);
    }

    @Override
    public CompanyResourceSummaryVO getCompanyResourceSummary(String companyId) {
        Long id = CompanyIdPolicy.parseCompanyId(companyId);
        if (companyService.getById(id) == null) {
            throw new BizException(ApiEnum.DATA_NOT_EXIST, "企业不存在");
        }
        long userCount = userService.count(new LambdaQueryWrapper<UserDO>()
            .eq(UserDO::getCompanyId, id));
        long userEnabledCount = userService.count(new LambdaQueryWrapper<UserDO>()
            .eq(UserDO::getCompanyId, id)
            .eq(UserDO::getStatus, EnableStatusEnum.ENABLED));
        long userGroupCount = userGroupService.count(new LambdaQueryWrapper<UserGroupDO>()
            .eq(UserGroupDO::getCompanyId, id));
        long companyChannelCount = companyChannelService.count(new LambdaQueryWrapper<CompanyChannelDO>()
            .eq(CompanyChannelDO::getCompanyId, id));
        return new CompanyResourceSummaryVO(String.valueOf(id), userCount, userEnabledCount,
            userGroupCount, companyChannelCount);
    }
}
