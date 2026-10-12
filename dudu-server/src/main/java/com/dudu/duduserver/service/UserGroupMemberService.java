package com.dudu.duduserver.service;

import com.baomidou.mybatisplus.spring.service.IService;
import com.dudu.duduserver.entity.UserGroupMemberDO;

import java.util.List;

/**
 * 企业组权限：初始管理员拥有本企业全部组，其他用户按成员关系授权。
 */
public interface UserGroupMemberService extends IService<UserGroupMemberDO> {

    // 从用户所属企业判定权限，不信任客户端声明的企业归属
    boolean canAccessGroup(Long userId, Long groupId);

    // 员工在本企业的成员关系对应的组 ID，按组 ID 升序去重；无关系返回空集合
    List<Long> listGroupIds(Long companyId, Long userId);
}
