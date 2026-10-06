package com.dudu.duduserver.dto;

import com.dudu.duduserver.util.CompanyIdPolicy;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 创建企业请求：携带选定企业 ID、基础资料与初始管理员；企业与初始管理员共同成功或共同失败。
 */
public record CompanyCreateDTO(

    @NotBlank(message = "企业 ID 不能为空")
    @Pattern(regexp = CompanyIdPolicy.PATTERN_STR, message = "企业 ID 必须为 100000–999999 的六位数字")
    String companyId,

    @NotBlank(message = "企业名称不能为空")
    @Size(max = 100, message = "企业名称长度不能超过 100 字符")
    String companyName,

    @Size(max = 100, message = "联系人长度不能超过 100 字符")
    String contactName,

    @Size(max = 200, message = "联系方式长度不能超过 200 字符")
    String contactInfo,

    @Size(max = 1000, message = "备注长度不能超过 1000 字符")
    String remark,

    @NotNull(message = "初始管理员信息不能为空")
    @Valid
    CompanyAdminInitDTO adminInit) {
}
