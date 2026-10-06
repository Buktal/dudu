package com.dudu.duduserver.dto;

import com.dudu.duduserver.common.PageQuery;
import com.dudu.duduserver.constant.OperationActionEnum;
import com.dudu.duduserver.util.CompanyIdPolicy;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;

/**
 * 操作记录查询：按目标企业、动作过滤并分页，按操作时间倒序；
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
    private OperationActionEnum action;

}
