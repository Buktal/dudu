package com.dudu.duduserver.vo;

/**
 * 企业员工的当前身份投影：与登录成功返回的 user/company/access 一致，不含 token 与过期时间。
 */
public record DeskProfileVO(DeskUserVO user, DeskCompanyVO company, DeskAccessVO access) {
}
