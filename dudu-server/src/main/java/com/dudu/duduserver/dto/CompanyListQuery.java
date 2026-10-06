package com.dudu.duduserver.dto;

import com.dudu.duduserver.config.query.PageQuery;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;

/**
 * 企业列表查询：关键词匹配企业名称（六位数字时同时精确匹配企业 ID）、状态筛选与分页；
 * 按创建时间倒序。分页字段继承 PageQuery，缺省由服务端取默认值。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@ToString(callSuper = true)
public class CompanyListQuery extends PageQuery {

    // 关键词：匹配企业名称，六位数字时同时精确匹配企业 ID
    @Size(max = 100, message = "关键词长度不能超过 100 字符")
    private String keyword;

    // 状态筛选，1 启用 / 0 停用，见 EnableStatusEnum
    @Min(value = 0, message = "状态只能为 0 或 1")
    @Max(value = 1, message = "状态只能为 0 或 1")
    private Integer status;
}
