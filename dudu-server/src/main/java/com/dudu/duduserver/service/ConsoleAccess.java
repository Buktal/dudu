package com.dudu.duduserver.service;

import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.entity.CompanyDO;
import com.dudu.duduserver.entity.UserDO;

import java.util.Set;

/**
 * 本次请求核验后的企业管理身份；仅服务端使用，不作为 HTTP 响应。
 */
public record ConsoleAccess(CompanyDO company, UserDO user, Set<Long> groupIds) {

    public Long companyId() {
        return company.getCompanyId();
    }

    public boolean initialAdmin() {
        return company.isInitialAdmin(user.getUserId());
    }

    public boolean manages(Long groupId) {
        return groupId != null && groupIds.contains(groupId);
    }

    public void requireInitialAdmin() {
        if (!initialAdmin()) {
            throw new BizException(ApiEnum.FORBIDDEN);
        }
    }
}

