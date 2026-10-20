package com.dudu.duduserver.service;

import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.entity.CompanyDO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.entity.UserGroupDO;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ConsoleAccessServiceTest {
    private final UserService users = mock(UserService.class);
    private final CompanyService companies = mock(CompanyService.class);
    private final UserGroupService groups = mock(UserGroupService.class);
    private final UserGroupMemberService members = mock(UserGroupMemberService.class);
    private final ConsoleAccessService access = new ConsoleAccessService(users, companies, groups, members);

    @Test
    void currentRoleAndCompanyAreCheckedInsteadOfTrustingOldToken() {
        UserDO user = identity(UserRoleEnum.USER);
        when(users.getById(2L)).thenReturn(user);
        assertThatThrownBy(() -> access.require(token())).isInstanceOf(BizException.class)
            .extracting("apiEnum.code").isEqualTo(10106);
    }

    @Test
    void ordinaryAdministratorHasOnlyRealGroupsOfItsOwnCompany() {
        identity(UserRoleEnum.CONSOLE);
        UserGroupDO group = new UserGroupDO();
        group.setGroupId(7L);
        group.setCompanyId(100001L);
        when(groups.listByCompany(100001L)).thenReturn(List.of(group));
        when(members.listGroupIds(100001L, 2L)).thenReturn(List.of(7L, 99L));
        ConsoleAccess result = access.require(token());
        assertThat(result.groupIds()).containsExactly(7L);
        assertThat(result.initialAdmin()).isFalse();
        assertThat(result.manages(99L)).isFalse();
        assertThatThrownBy(result::requireInitialAdmin).isInstanceOf(BizException.class);
    }

    private UserDO identity(UserRoleEnum role) {
        UserDO user = new UserDO();
        user.setUserId(2L);
        user.setCompanyId(100001L);
        user.setRole(role);
        user.setStatus(EnableStatusEnum.ENABLED);
        CompanyDO company = new CompanyDO();
        company.setCompanyId(100001L);
        company.setInitUserId(1L);
        company.setStatus(EnableStatusEnum.ENABLED);
        when(users.getById(2L)).thenReturn(user);
        when(companies.getById(100001L)).thenReturn(company);
        return user;
    }

    private JwtUser token() {
        return new JwtUser(100001L, 2L, UserRoleEnum.CONSOLE, Long.MAX_VALUE);
    }
}
