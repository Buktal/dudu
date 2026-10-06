package com.dudu.duduserver.vo;

import com.dudu.duduserver.entity.UserDO;

import java.time.LocalDateTime;

/**
 * 企业初始管理员的非敏感资料视图；不含密码、哈希或令牌，状态为 0/1。
 */
public record CompanyAdminInitVO(
    String userId,
    String username,
    String name,
    Integer status,
    LocalDateTime createTime) {

    // 由用户实体映射，业务 ID 统一十进制字符串
    public static CompanyAdminInitVO of(UserDO user) {
        return new CompanyAdminInitVO(
            String.valueOf(user.getUserId()),
            user.getUsername(),
            user.getName(),
            user.getStatus(),
            user.getCreateTime());
    }
}
