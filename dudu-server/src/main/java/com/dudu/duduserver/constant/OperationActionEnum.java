package com.dudu.duduserver.constant;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.Getter;

/**
 * 平台操作记录的动作代码，前缀为目标对象域：company 企业、admin 平台管理员。
 * 仅记录与业务事务共同提交的已完成操作。
 */
@Getter
public enum OperationActionEnum {

    // 企业
    COMPANY_CREATE("company.create", OperationTargetEnum.COMPANY), // 创建企业及初始管理员
    COMPANY_UPDATE("company.update", OperationTargetEnum.COMPANY), // 编辑企业基础资料
    COMPANY_DISABLE("company.disable", OperationTargetEnum.COMPANY), // 停用企业
    COMPANY_ENABLE("company.enable", OperationTargetEnum.COMPANY), // 恢复企业

    // 平台管理员
    ADMIN_PASSWORD_RESET("admin.password_reset", OperationTargetEnum.USER), // 平台管理员重置企业管理员密码
    ADMIN_PASSWORD_CHANGE("admin.password_change", OperationTargetEnum.USER); // 平台管理员修改自己密码

    @EnumValue
    @JsonValue
    private final String code;
    private final OperationTargetEnum target;

    OperationActionEnum(String code, OperationTargetEnum target) {
        this.code = code;
        this.target = target;
    }

    // 按代码解析，未知代码转参数错误
    @JsonCreator
    public static OperationActionEnum fromCode(String code) {
        for (OperationActionEnum action : values()) {
            if (action.code.equals(code)) {
                return action;
            }
        }
        throw new IllegalArgumentException("未知的操作类型: " + code);
    }
}
