package com.dudu.duduserver.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 平台管理员重置企业管理员密码的请求；新密码为只写入参，不回传。
 */
public record AdminPasswordResetDTO(

    @NotBlank(message = "新密码不能为空")
    @Size(min = 8, max = 72, message = "新密码长度须为 8–72 字符")
    String newPassword) {
}
