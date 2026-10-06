package com.dudu.duduserver.service;

import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.dto.AdminPasswordChangeDTO;
import com.dudu.duduserver.dto.AdminLoginDTO;
import com.dudu.duduserver.vo.AdminDetailVO;
import com.dudu.duduserver.vo.AdminLoginVO;

/**
 * 认证与个人账号服务：登录校验凭据并签发 token（载荷含企业归属，平台用户为 null）；
 * 首版无撤销表，退出由客户端弃用 token，改密后旧 token 有效至过期。
 */
public interface AuthService {

    // 平台登录：账号不存在、密码错误、角色不符或已停用统一返回同一认证失败，不区分提示
    AdminLoginVO login(AdminLoginDTO request);

    // 当前账号信息；以数据库为准而非 token 载荷快照
    AdminDetailVO getDetail(JwtUser me);

    // 修改自己密码：校验原密码，成功后记录操作；旧 token 有效至过期
    void updatePassword(JwtUser me, AdminPasswordChangeDTO request);
}
