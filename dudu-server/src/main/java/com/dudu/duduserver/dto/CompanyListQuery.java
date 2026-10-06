package com.dudu.duduserver.dto;

import com.dudu.duduserver.common.PageQuery;
import com.dudu.duduserver.constant.EnableStatusEnum;
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
    private EnableStatusEnum status;
}
