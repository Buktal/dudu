package com.dudu.duduserver.service.impl;

import com.dudu.duduserver.entity.CompanyDO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.entity.UserGroupDO;
import com.dudu.duduserver.service.CompanyChannelService;
import com.dudu.duduserver.service.DeskAccess;
import com.dudu.duduserver.service.DeskAccessService;
import com.dudu.duduserver.service.UserGroupMemberService;
import com.dudu.duduserver.service.UserGroupService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 接待范围实现：先读本企业的全部组，再按初始管理员或成员关系取授权集合，
 * 组与账号都限定在当前企业内，脏关联不会因缺少外键而放行。
 */
@Service
@RequiredArgsConstructor
public class DeskAccessServiceImpl implements DeskAccessService {

    private final UserGroupService userGroupService;
    private final UserGroupMemberService userGroupMemberService;
    private final CompanyChannelService companyChannelService;

    @Override
    public DeskAccess resolve(CompanyDO company, UserDO user) {
        Long companyId = company.getCompanyId();
        boolean allGroups = company.isInitialAdmin(user.getUserId());
        List<UserGroupDO> companyGroups = userGroupService.listByCompany(companyId);
        Set<Long> allowedGroupIds = allowedGroupIds(companyId, user, allGroups, companyGroups);

        List<UserGroupDO> groups = companyGroups.stream()
            .filter(group -> allowedGroupIds.contains(group.getGroupId())).toList();
        return DeskAccess.of(allGroups, groups,
            companyChannelService.listByCompanyGroups(companyId, allowedGroupIds));
    }

    // 初始管理员为本企业全部组；其他员工按成员关系与本企业组取交集，成员行不能指向其他企业的组
    private Set<Long> allowedGroupIds(Long companyId, UserDO user, boolean allGroups, List<UserGroupDO> companyGroups) {
        Set<Long> companyGroupIds = companyGroups.stream()
            .map(UserGroupDO::getGroupId).collect(Collectors.toSet());
        if (allGroups) {
            return companyGroupIds;
        }
        Set<Long> memberGroupIds = new HashSet<>(userGroupMemberService.listGroupIds(companyId, user.getUserId()));
        memberGroupIds.retainAll(companyGroupIds);
        return memberGroupIds;
    }
}
