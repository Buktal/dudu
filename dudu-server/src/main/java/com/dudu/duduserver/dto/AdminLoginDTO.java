package com.dudu.duduserver.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 平台登录请求：账号与密码（Spec #68，企业登录接口另行实现）。
 */
public record AdminLoginDTO(

    @NotBlank(message = "账号不能为空")
    @Size(max = 64, message = "账号长度不能超过 64 字符")
    String username,

    @NotBlank(message = "密码不能为空")
    @Size(max = 72, message = "密码长度不能超过 72 字符")
    String password) {
}
