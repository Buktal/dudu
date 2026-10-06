package com.dudu.duduserver.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 创建企业时同步初始化的企业管理员凭据；密码为只写入参，任何响应不回传。
 */
public record CompanyAdminInitDTO(

    @NotBlank(message = "初始管理员登录名不能为空")
    @Size(min = 2, max = 64, message = "登录名长度须为 2–64 字符")
    String username,

    @NotBlank(message = "初始管理员密码不能为空")
    @Size(min = 8, max = 72, message = "密码长度须为 8–72 字符")
    String password,

    @Size(max = 100, message = "显示名称长度不能超过 100 字符")
    String name) {
}
