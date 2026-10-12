package com.dudu.duduserver.service;

import com.baomidou.mybatisplus.spring.service.IService;
import com.dudu.duduserver.entity.UserGroupDO;

import java.util.List;

/**
 * 接待组领域服务；本轮仅支撑资源汇总计数与企业接待范围，管理能力由 Console 阶段补充。
 */
public interface UserGroupService extends IService<UserGroupDO> {

    // 本企业全部用户组，按组 ID 数值升序
    List<UserGroupDO> listByCompany(Long companyId);
}
