package com.dudu.duduserver.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 平台管理员修改自己密码的请求；新密码规则与全站一致（8–72 字符，不限字符类型）。
 */
public record AdminPasswordChangeDTO(

    @NotBlank(message = "原密码不能为空")
    @Size(max = 72, message = "原密码长度不能超过 72 字符")
    String oldPassword,

    @NotBlank(message = "新密码不能为空")
    @Size(min = 8, max = 72, message = "新密码长度须为 8–72 字符")
    String newPassword) {
}
