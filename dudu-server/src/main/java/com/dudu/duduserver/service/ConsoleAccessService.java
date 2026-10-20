package com.dudu.duduserver.service;

import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.entity.CompanyDO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.entity.UserGroupDO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Console 实时身份与管理范围边界；管理写入须在业务事务内先锁企业，再调用目标授权。
 */
@Service
@RequiredArgsConstructor
public class ConsoleAccessService {
    private final UserService users;
    private final CompanyService companies;
    private final UserGroupService groups;
    private final UserGroupMemberService members;

    public ConsoleAccess require(JwtUser me) {
        requireTokenCompany(me);
        return resolve(me, companies.getById(me.companyId()));
    }

    // Lambda 无锁操作，固定 FOR UPDATE 片段不含用户输入；禁止脱离调用方业务事务使用。
    @Transactional(propagation = Propagation.MANDATORY)
    public ConsoleAccess lock(JwtUser me) {
        requireTokenCompany(me);
        CompanyDO company = companies.lambdaQuery().eq(CompanyDO::getCompanyId, me.companyId())
            .last("FOR UPDATE").one();
        return resolve(me, company);
    }

    public UserGroupDO requireGroup(ConsoleAccess access, Long groupId) {
        UserGroupDO group = groups.getById(groupId);
        if (group == null || !access.companyId().equals(group.getCompanyId()) || !access.manages(groupId)) {
            throw new BizException(ApiEnum.DATA_NOT_EXIST);
        }
        return group;
    }

    public UserDO requireUser(ConsoleAccess access, Long userId) {
        UserDO user = users.getById(userId);
        if (user == null || !access.companyId().equals(user.getCompanyId())) {
            throw new BizException(ApiEnum.DATA_NOT_EXIST);
        }
        return user;
    }

    private void requireTokenCompany(JwtUser me) {
        if (me == null || me.companyId() == null || me.role() != UserRoleEnum.CONSOLE) {
            throw new BizException(ApiEnum.FORBIDDEN);
        }
    }

    private ConsoleAccess resolve(JwtUser me, CompanyDO company) {
        UserDO user = users.getById(me.userId());
        if (user == null || !me.companyId().equals(user.getCompanyId())
            || user.getStatus() != EnableStatusEnum.ENABLED || company == null
            || company.getStatus() != EnableStatusEnum.ENABLED) {
            throw new BizException(ApiEnum.TOKEN_VERIFY);
        }
        if (user.getRole() != UserRoleEnum.CONSOLE) {
            throw new BizException(ApiEnum.FORBIDDEN);
        }
        Set<Long> groupIds = groups.listByCompany(me.companyId()).stream()
            .map(UserGroupDO::getGroupId).collect(Collectors.toSet());
        if (!company.isInitialAdmin(user.getUserId())) {
            groupIds.retainAll(new HashSet<>(members.listGroupIds(me.companyId(), user.getUserId())));
        }
        return new ConsoleAccess(company, user, Set.copyOf(groupIds));
    }
}
