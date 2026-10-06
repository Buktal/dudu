package com.dudu.duduserver.dto;

import com.dudu.duduserver.config.query.PageQuery;
import com.dudu.duduserver.util.CompanyIdPolicy;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;

/**
 * 操作记录查询：按目标企业、动作与结果过滤并分页，按操作时间倒序；
 * 分页字段继承 PageQuery，缺省由服务端取默认值。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@ToString(callSuper = true)
public class OperationLogQuery extends PageQuery {

    // 目标企业 ID 精确过滤
    @Pattern(regexp = CompanyIdPolicy.PATTERN_STR, message = "企业 ID 必须为 100000–999999 的六位数字")
    private String companyId;

    // 操作类型代码，见 OperationActionEnum
    @Size(max = 64, message = "操作类型长度不能超过 64 字符")
    private String action;

    // 操作结果过滤
    @Pattern(regexp = "success|failure", message = "结果只能为 success 或 failure")
    private String result;
}
