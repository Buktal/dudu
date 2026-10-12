package com.dudu.duduserver.service;

import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.dto.DeskLoginDTO;
import com.dudu.duduserver.vo.DeskAccessVO;
import com.dudu.duduserver.vo.DeskLoginVO;
import com.dudu.duduserver.vo.DeskProfileVO;

/**
 * 企业接待端认证服务：企业/员工校验、凭据签发与企业侧授权范围投影；
 * 沿用平台登录相同的无状态 JWT 与密码校验，退出不引入令牌撤销。
 */
public interface DeskAuthService {

    // 企业登录：企业或员工不存在、停用、角色不符与凭据错误统一返回同一认证失败，不区分提示
    DeskLoginVO login(DeskLoginDTO request);

    // 按 token 载荷定位当前企业员工；身份不存在、归属不符或停用均按无效登录处理
    DeskProfileVO getProfile(JwtUser me);

    // 访客等资源接口共用的身份守卫：先核对实时企业员工身份，再返回该员工当前的接待范围
    DeskAccessVO requireAccess(JwtUser me);
}
