package com.dudu.duduserver.vo;

import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.entity.UserDO;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 企业员工安全详情，不包含哈希或明文密码。
 */
public record ConsoleEmployeeVO(String userId, String username, String name, UserRoleEnum role,
                                EnableStatusEnum status, Boolean isInitialAdmin, List<String> groupIds,
                                LocalDateTime createTime, LocalDateTime updateTime) {
    public static ConsoleEmployeeVO of(UserDO user, Boolean initialAdmin, List<String> groupIds) {
        return new ConsoleEmployeeVO(String.valueOf(user.getUserId()), user.getUsername(), user.getName(),
            user.getRole(), user.getStatus(), initialAdmin, groupIds, user.getCreateTime(), user.getUpdateTime());
    }
}
