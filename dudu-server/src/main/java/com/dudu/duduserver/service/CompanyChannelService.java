package com.dudu.duduserver.service;

import com.baomidou.mybatisplus.spring.service.IService;
import com.dudu.duduserver.entity.CompanyChannelDO;

import java.util.Collection;
import java.util.List;

/**
 * 渠道接入账号领域服务；本轮支撑资源汇总计数与企业接待范围，启停与授权由 Console 阶段补充。
 */
public interface CompanyChannelService extends IService<CompanyChannelDO> {

    // 指定企业且属于给定组的渠道账号，按账号 ID 数值升序；组集合为空时不查询
    List<CompanyChannelDO> listByCompanyGroups(Long companyId, Collection<Long> groupIds);
}
