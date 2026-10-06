package com.dudu.duduserver.constant;

/**
 * 用户角色，按客户端划分：Admin 平台运营、企业管理、企业员工。
 * 授权边界见 ADR 0011：角色不授予跨边界权限，接口仍需按前缀校验。
 */
public enum UserRoleEnum {

    // 平台管理员，使用 DuduAdmin
    ADMIN("admin"),

    // 企业管理，拥有本企业全部接待组权限，使用 Console
    CONSOLE("console"),

    // 企业员工，按组成员关系授权
    USER("user");

    public final String code;

    UserRoleEnum(String code) {
        this.code = code;
    }
}
