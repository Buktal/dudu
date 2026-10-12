package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.spring.service.impl.ServiceImpl;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.mapper.CompanyChannelMapper;
import com.dudu.duduserver.service.CompanyChannelService;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.List;

/**
 * 渠道接入账号领域服务实现，SQL 全部经 MyBatis-Plus 通用能力与 Lambda 构造器表达。
 */
@Service
public class CompanyChannelServiceImpl extends ServiceImpl<CompanyChannelMapper, CompanyChannelDO>
    implements CompanyChannelService {

    @Override
    public List<CompanyChannelDO> listByCompanyGroups(Long companyId, Collection<Long> groupIds) {
        if (groupIds == null || groupIds.isEmpty()) {
            return List.of();
        }
        return lambdaQuery()
            .eq(CompanyChannelDO::getCompanyId, companyId)
            .in(CompanyChannelDO::getGroupId, groupIds)
            .orderByAsc(CompanyChannelDO::getCompanyChannelId)
            .list();
    }
}
