package com.dudu.duduserver.vo;

import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.constant.UserRoleEnum;

/**
 * 实际成员视图，保留停用员工。
 */
public record ConsoleGroupMemberVO(String userId, String username, String name, UserRoleEnum role,
                                   EnableStatusEnum status) {
}
