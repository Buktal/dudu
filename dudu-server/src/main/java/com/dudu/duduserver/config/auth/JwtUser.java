package com.dudu.duduserver.config.auth;

import com.dudu.duduserver.constant.UserRoleEnum;

/**
 * token 的强类型载荷，Controller 通过 @Me 获取；新增载荷字段直接扩展此类型。
 * 字段按归属排序：先企业归属与用户标识，再角色与过期时间；companyId 平台用户为 null；
 * exp 为过期时间（epoch 秒），序列化即标准 exp claim。
 */
public record JwtUser(Long companyId, Long userId, UserRoleEnum role, Long exp) {
}
