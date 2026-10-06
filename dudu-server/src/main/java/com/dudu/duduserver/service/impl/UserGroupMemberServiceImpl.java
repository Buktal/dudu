package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.spring.service.impl.ServiceImpl;
import com.dudu.duduserver.entity.CompanyDO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.entity.UserGroupDO;
import com.dudu.duduserver.entity.UserGroupMemberDO;
import com.dudu.duduserver.mapper.UserGroupMemberMapper;
import com.dudu.duduserver.service.CompanyService;
import com.dudu.duduserver.service.UserGroupMemberService;
import com.dudu.duduserver.service.UserGroupService;
import com.dudu.duduserver.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 先检查企业隔离，再识别初始管理员或显式成员；普通管理员无隐式全组权限。
 */
@Service
@RequiredArgsConstructor
public class UserGroupMemberServiceImpl extends ServiceImpl<UserGroupMemberMapper, UserGroupMemberDO>
    implements UserGroupMemberService {

    private final UserService userService;
    private final UserGroupService userGroupService;
    private final CompanyService companyService;

    @Override
    public boolean canAccessGroup(Long userId, Long groupId) {
        UserDO user = userService.getById(userId);
        UserGroupDO group = userGroupService.getById(groupId);
        if (user == null || user.getCompanyId() == null || group == null
            || !user.getCompanyId().equals(group.getCompanyId())) {
            return false;
        }
        CompanyDO company = companyService.getById(user.getCompanyId());
        if (company == null) {
            return false;
        }
        if (userId.equals(company.getInitUserId())) {
            return true;
        }
        return lambdaQuery().eq(UserGroupMemberDO::getCompanyId, user.getCompanyId())
            .eq(UserGroupMemberDO::getUserId, userId).eq(UserGroupMemberDO::getGroupId, groupId).exists();
    }
}
