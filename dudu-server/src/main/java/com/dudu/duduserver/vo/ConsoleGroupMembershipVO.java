package com.dudu.duduserver.vo;

/**
 * 幂等成员操作结果。
 */
public record ConsoleGroupMembershipVO(String groupId, String userId, Boolean member) {
}
