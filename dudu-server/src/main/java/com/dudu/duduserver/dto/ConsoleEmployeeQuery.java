package com.dudu.duduserver.dto;

import com.dudu.duduserver.common.PageQuery;
import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 企业员工分页查询，只按当前企业身份限定作用域。
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class ConsoleEmployeeQuery extends PageQuery implements ConsoleRequest {
    private String keyword;
    private EnableStatusEnum status;
    private UserRoleEnum role;
}
