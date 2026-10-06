package com.dudu.duduserver.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 企业基础资料完整编辑请求：选填字段提交 null 表示清空，不能以省略字段表达保留。
 */
public record CompanyUpdateDTO(

    @NotBlank(message = "企业名称不能为空")
    @Size(max = 100, message = "企业名称长度不能超过 100 字符")
    String companyName,

    @Size(max = 100, message = "联系人长度不能超过 100 字符")
    String contactName,

    @Size(max = 200, message = "联系方式长度不能超过 200 字符")
    String contactInfo,

    @Size(max = 1000, message = "备注长度不能超过 1000 字符")
    String remark) {
}
