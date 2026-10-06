package com.dudu.duduserver.constant;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 用户角色；普通企业管理员按成员关系授权，全组权限由企业初始管理员身份决定。
 */
@Getter
@RequiredArgsConstructor
public enum UserRoleEnum {

    ADMIN("admin"),
    CONSOLE("console"),
    USER("user");

    @EnumValue
    @JsonValue
    private final String code;

    // 数据库、JSON 与查询参数共用业务代码，拒绝未知值
    @JsonCreator
    public static UserRoleEnum fromCode(String code) {
        for (UserRoleEnum value : values()) {
            if (value.code.equals(code)) {
                return value;
            }
        }
        throw new IllegalArgumentException("未知的UserRoleEnum: " + code);
    }
    // Hutool JSON 使用枚举文本，保持 JWT 与 HTTP 相同的小写角色代码
    @Override
    public String toString() {
        return code;
    }
}
