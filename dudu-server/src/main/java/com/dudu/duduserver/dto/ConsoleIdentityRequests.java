package com.dudu.duduserver.dto;

import com.dudu.duduserver.util.CompanyIdPolicy;
import com.dudu.duduserver.util.ConsoleIdDeserializer;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.constant.UserRoleEnum;

/**
 * Console 身份与员工命令的字段白名单；密码不 trim。
 */
public final class ConsoleIdentityRequests {
    private ConsoleIdentityRequests() {
    }

    /**
     * 六位企业 ID、登录名与原文密码。
     */
    public record Login(
        @NotBlank @Pattern(regexp = CompanyIdPolicy.PATTERN_STR)
        @JsonDeserialize(using = ConsoleIdDeserializer.class) String companyId,
        @NotBlank String username,
        @NotBlank @Size(max = 72) String password) implements ConsoleRequest {
    }

    /**
     * 本人改密必须提供原密码。
     */
    public record PasswordChange(
        @NotBlank @Size(max = 72) String oldPassword,
        @NotBlank @Size(min = 8, max = 72) String newPassword) implements ConsoleRequest {
    }

    /**
     * 新员工不接受角色、状态或企业归属覆盖。
     */
    public record CreateEmployee(
        @NotBlank @Size(min = 2, max = 64) String username,
        @NotBlank @Size(max = 100) String name,
        @NotBlank @Size(min = 8, max = 72) String password) implements ConsoleRequest {
        public CreateEmployee {
            username = username == null ? null : username.trim();
            name = name == null ? null : name.trim();
        }
    }

    /**
     * 唯一可直接编辑的员工资料字段。
     */
    public record Name(@NotBlank @Size(max = 100) String name) implements ConsoleRequest {
        public Name {
            name = name == null ? null : name.trim();
        }
    }

    /**
     * 员工启停目标状态。
     */
    public record Status(@NotNull EnableStatusEnum status) implements ConsoleRequest {
    }

    /**
     * 员工角色目标，服务层再拒绝平台角色。
     */
    public record Role(@NotNull UserRoleEnum role) implements ConsoleRequest {
    }

    /**
     * 初始管理员重置他人密码。
     */
    public record PasswordReset(@NotBlank @Size(min = 8, max = 72) String newPassword) implements ConsoleRequest {
    }
}
