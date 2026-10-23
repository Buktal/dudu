package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.spring.service.impl.ServiceImpl;
import com.dudu.duduserver.entity.UserGroupMemberDO;
import com.dudu.duduserver.mapper.UserGroupMemberMapper;
import com.dudu.duduserver.service.UserGroupMemberService;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 成员关系表访问：保持 IService 中性语义，不在持久层按写入动作推断业务事件——范围变更
 * 事件（DeskAccessChangedEvent）由业务写路径（ConsoleGroupService.membership 等）在
 * 事务内显式发布，与 Console 其余写操作的口径一致，saveBatch 等旁路写不会静默丢事件。
 */
@Service
public class UserGroupMemberServiceImpl extends ServiceImpl<UserGroupMemberMapper, UserGroupMemberDO>
    implements UserGroupMemberService {

    @Override
    public List<Long> listGroupIds(Long companyId, Long userId) {
        return lambdaQuery()
            .eq(UserGroupMemberDO::getCompanyId, companyId)
            .eq(UserGroupMemberDO::getUserId, userId)
            .orderByAsc(UserGroupMemberDO::getGroupId)
            .list().stream().map(UserGroupMemberDO::getGroupId).distinct().toList();
    }
}
