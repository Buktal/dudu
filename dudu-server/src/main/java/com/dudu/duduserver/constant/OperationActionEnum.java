package com.dudu.duduserver.constant;

/**
 * 平台操作记录的动作代码，前缀为目标对象域：company 企业、admin 平台管理员。
 * 首版只记录成功操作；失败留痕口径待决策票 #64。
 */
public enum OperationActionEnum {

    // 企业
    COMPANY_CREATE("company.create"), // 创建企业及初始管理员
    COMPANY_UPDATE("company.update"), // 编辑企业基础资料
    COMPANY_DISABLE("company.disable"), // 停用企业
    COMPANY_ENABLE("company.enable"), // 恢复企业

    // 平台管理员
    ADMIN_PASSWORD_RESET("admin.password_reset"), // 平台管理员重置企业管理员密码
    ADMIN_PASSWORD_CHANGE("admin.password_change"); // 平台管理员修改自己密码

    public final String code;

    OperationActionEnum(String code) {
        this.code = code;
    }

    // 按代码解析，未知代码返回 null 供调用方转参数错误
    public static OperationActionEnum ofCode(String code) {
        for (OperationActionEnum action : values()) {
            if (action.code.equals(code)) {
                return action;
            }
        }
        return null;
    }
}
