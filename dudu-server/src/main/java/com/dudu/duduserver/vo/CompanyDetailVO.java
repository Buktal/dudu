package com.dudu.duduserver.vo;

/**
 * 企业详情视图：企业资料 + 初始管理员非敏感资料（未初始化时为 null）。
 */
public record CompanyDetailVO(CompanyVO company, CompanyAdminInitVO adminInit) {
}
