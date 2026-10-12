package com.dudu.duduserver.vo;

/**
 * 企业登录成功结果：exp 为 token 过期时间（epoch 秒），与 JWT 载荷一致；
 * user/company/access 与身份恢复接口使用同一投影。
 */
public record DeskLoginVO(String token, Long exp, DeskUserVO user, DeskCompanyVO company, DeskAccessVO access) {
}
