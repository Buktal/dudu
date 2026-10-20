package com.dudu.duduserver.vo;

import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.service.ConsoleAccess;
import java.util.List;

/**
 * Console 安全身份投影；范围由当前持久关系推导，不含凭据。
 */
public record ConsoleProfileVO(Company company, User user, List<String> managedGroupIds) {
    public static ConsoleProfileVO of(ConsoleAccess access) {
        return new ConsoleProfileVO(
            new Company(String.valueOf(access.companyId()), access.company().getCompanyName()),
            new User(String.valueOf(access.user().getUserId()), access.user().getUsername(),
                access.user().getName(), access.user().getRole(), access.initialAdmin()),
            access.groupIds().stream().sorted().map(String::valueOf).toList());
    }

    /**
     * 当前企业的公开标识。
     */
    public record Company(String companyId, String companyName) {
    }

    /**
     * 当前员工身份和管理权来源。
     */
    public record User(String userId, String username, String name, UserRoleEnum role, Boolean isInitialAdmin) {
    }
}
