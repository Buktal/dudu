package com.dudu.duduserver.dto;

import com.dudu.duduserver.util.CompanyIdPolicy;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 企业登录请求：企业 ID 为六位数字字符串，账号沿用企业内不区分大小写的登录名，
 * 密码不去除首尾空白且不超过现有登录上限（Spec #85）。
 */
public record DeskLoginDTO(

    @NotBlank(message = "企业 ID 不能为空")
    @Pattern(regexp = CompanyIdPolicy.PATTERN_STR, message = "企业 ID 必须为 100000–999999 的六位数字")
    String companyId,

    @NotBlank(message = "账号不能为空")
    String username,

    @NotBlank(message = "密码不能为空")
    @Size(max = 72, message = "密码长度不能超过 72 字符")
    String password) {
}
