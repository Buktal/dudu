package com.dudu.duduserver.service;

import com.dudu.duduserver.entity.CompanyDO;
import com.dudu.duduserver.entity.UserDO;

/**
 * 企业接待范围服务：把当前登录员工解析为可访问的组与渠道账号，
 * 供 Desk 的登录、身份恢复与后续访客查询共用同一份企业隔离规则。
 */
public interface DeskAccessService {

    // 实时计算企业内授权范围；初始管理员为全部组，其他员工按成员关系，不信任客户端声明的企业归属
    DeskAccess resolve(CompanyDO company, UserDO user);
}
