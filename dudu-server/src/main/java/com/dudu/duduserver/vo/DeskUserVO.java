package com.dudu.duduserver.vo;

import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.entity.UserDO;

/**
 * 企业员工的非敏感身份视图：角色仅 console/user，不含头像与任何凭据。
 */
public record DeskUserVO(String userId, String username, String name, UserRoleEnum role) {

    // 仅映射此视图声明的公开字段，ID 输出十进制字符串
    public static DeskUserVO of(UserDO source) {
        return new DeskUserVO(String.valueOf(source.getUserId()), source.getUsername(),
            source.getName(), source.getRole());
    }
}
