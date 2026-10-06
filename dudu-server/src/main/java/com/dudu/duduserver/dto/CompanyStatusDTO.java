package com.dudu.duduserver.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 企业启停状态更新请求：status 0 停用、1 恢复。
 * 停用原因在停用时必填（由服务层校验），恢复时携带的原因被忽略（恢复即清空）。
 */
public record CompanyStatusDTO(

    @NotNull(message = "状态不能为空")
    @Min(value = 0, message = "状态只能是 0 或 1")
    @Max(value = 1, message = "状态只能是 0 或 1")
    Integer status,

    @Size(max = 500, message = "停用原因长度不能超过 500 字符")
    String disableReason) {
}
