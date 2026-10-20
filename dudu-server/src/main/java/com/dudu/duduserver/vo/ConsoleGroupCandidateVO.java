package com.dudu.duduserver.vo;

import com.dudu.duduserver.constant.UserRoleEnum;

/**
 * 可添加的启用员工。
 */
public record ConsoleGroupCandidateVO(String userId, String username, String name, UserRoleEnum role) {
}
