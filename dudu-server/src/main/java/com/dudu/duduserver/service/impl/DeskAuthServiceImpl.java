package com.dudu.duduserver.service.impl;

import cn.hutool.core.date.DateUtil;
import com.dudu.duduserver.config.auth.JwtManager;
import com.dudu.duduserver.config.auth.JwtProperties;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.dto.DeskLoginDTO;
import com.dudu.duduserver.entity.CompanyDO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.service.CompanyService;
import com.dudu.duduserver.service.DeskAccessService;
import com.dudu.duduserver.service.DeskAuthService;
import com.dudu.duduserver.service.UserService;
import com.dudu.duduserver.util.CompanyIdPolicy;
import com.dudu.duduserver.util.PasswordHasher;
import com.dudu.duduserver.vo.DeskAccessVO;
import com.dudu.duduserver.vo.DeskCompanyVO;
import com.dudu.duduserver.vo.DeskLoginVO;
import com.dudu.duduserver.vo.DeskProfileVO;
import com.dudu.duduserver.vo.DeskUserVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 企业接待端认证服务实现：先按企业作用域定位员工并校验凭据，再校验企业与员工状态、角色，
 * 身份读取与接待范围每次都按持久数据重新计算，不把授权范围写进 token。
 */
@Service
@RequiredArgsConstructor
public class DeskAuthServiceImpl implements DeskAuthService {

    // 登录名沿用数据库列宽，按去首尾空白后的长度校验
    private static final int USERNAME_MAX_LENGTH = 64;

    private final UserService userService;
    private final CompanyService companyService;
    private final DeskAccessService deskAccessService;
    private final JwtManager jwtManager;
    private final JwtProperties jwtProperties;

    @Override
    public DeskLoginVO login(DeskLoginDTO request) {
        String username = request.username().trim();
        if (username.length() > USERNAME_MAX_LENGTH) {
            throw new BizException(ApiEnum.PARAM_EXCEED, "账号长度不能超过 64 字符");
        }
        Long companyId = CompanyIdPolicy.parseCompanyId(request.companyId());
        UserDO user = userService.findCompanyUser(companyId, username);
        if (user == null || !PasswordHasher.matches(request.password(), user.getPasswordHash())) {
            throw new BizException(ApiEnum.LOGIN_FAILED);
        }
        CompanyDO company = companyService.getById(companyId);
        if (company == null || company.getStatus() != EnableStatusEnum.ENABLED
            || user.getStatus() != EnableStatusEnum.ENABLED || !isAgentRole(user.getRole())) {
            throw new BizException(ApiEnum.LOGIN_FAILED);
        }

        Long exp = DateUtil.currentSeconds() + jwtProperties.ttlSeconds();
        String token = jwtManager.createToken(new JwtUser(companyId, user.getUserId(), user.getRole(), exp));
        return new DeskLoginVO(token, exp, DeskUserVO.of(user), DeskCompanyVO.of(company),
            deskAccessService.resolve(company, user));
    }

    @Override
    public DeskProfileVO getProfile(JwtUser me) {
        UserDO user = userService.getById(me.userId());
        if (user == null || user.getCompanyId() == null || !user.getCompanyId().equals(me.companyId())
            || !isAgentRole(user.getRole()) || user.getStatus() != EnableStatusEnum.ENABLED) {
            throw new BizException(ApiEnum.TOKEN_VERIFY);
        }
        CompanyDO company = companyService.getById(user.getCompanyId());
        if (company == null || company.getStatus() != EnableStatusEnum.ENABLED) {
            throw new BizException(ApiEnum.TOKEN_VERIFY);
        }
        DeskAccessVO access = deskAccessService.resolve(company, user);
        return new DeskProfileVO(DeskUserVO.of(user), DeskCompanyVO.of(company), access);
    }

    // 企业坐席只包含企业管理员与普通员工；平台 admin 身份不进入企业接待
    private boolean isAgentRole(UserRoleEnum role) {
        return role == UserRoleEnum.CONSOLE || role == UserRoleEnum.USER;
    }
}
