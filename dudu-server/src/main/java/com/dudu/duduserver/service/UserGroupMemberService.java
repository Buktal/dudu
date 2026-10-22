package com.dudu.duduserver.service;

import com.baomidou.mybatisplus.spring.service.IService;
import com.dudu.duduserver.entity.UserGroupMemberDO;

import java.util.List;

/**
 * 员工-组成员关系：授权判定（初始管理员全组、其余按成员关系）收口在 DeskAccessService
 */
public interface UserGroupMemberService extends IService<UserGroupMemberDO> {

    // 员工在本企业的成员关系对应的组 ID，按组 ID 升序去重；无关系返回空集合
    List<Long> listGroupIds(Long companyId, Long userId);
}
