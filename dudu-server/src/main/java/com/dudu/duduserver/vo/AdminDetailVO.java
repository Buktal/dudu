package com.dudu.duduserver.vo;

import com.dudu.duduserver.entity.UserDO;

/**
 * 平台管理员的非敏感详情视图。
 */
public record AdminDetailVO(String userId, String username, String name, String role) {

    // 由用户实体映射，业务 ID 统一十进制字符串（数据契约）
    public static AdminDetailVO of(UserDO user) {
        return new AdminDetailVO(String.valueOf(user.getUserId()), user.getUsername(), user.getName(), user.getRole());
    }
}
