package com.dudu.duduserver.service;

import com.dudu.duduserver.config.auth.JwtManager;
import com.dudu.duduserver.config.auth.JwtProperties;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.dto.ConsoleIdentityRequests;
import com.dudu.duduserver.entity.CompanyDO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.util.CompanyIdPolicy;
import com.dudu.duduserver.util.PasswordHasher;
import com.dudu.duduserver.vo.ConsoleLoginVO;
import com.dudu.duduserver.vo.ConsoleProfileVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;

/**
 * 企业管理员登录与个人改密，沿用现有无状态 JWT 与密码哈希实现。
 */
@Service
@RequiredArgsConstructor
public class ConsoleIdentityService {
    private final UserService users;
    private final CompanyService companies;
    private final ConsoleAccessService accessService;
    private final JwtManager jwtManager;
    private final JwtProperties jwtProperties;

    public ConsoleLoginVO login(ConsoleIdentityRequests.Login request) {
        String username = request.username().trim();
        if (username.length() > 64) throw new BizException(ApiEnum.PARAM_EXCEED);
        Long companyId = CompanyIdPolicy.parseCompanyId(request.companyId());
        UserDO user = users.findCompanyUser(companyId, username);
        if (user == null || !PasswordHasher.matches(request.password(), user.getPasswordHash())) {
            throw new BizException(ApiEnum.LOGIN_FAILED);
        }
        CompanyDO company = companies.getById(companyId);
        if (company == null || company.getStatus() != EnableStatusEnum.ENABLED
            || user.getStatus() != EnableStatusEnum.ENABLED) {
            throw new BizException(ApiEnum.LOGIN_FAILED);
        }
        if (user.getRole() != UserRoleEnum.CONSOLE) throw new BizException(ApiEnum.FORBIDDEN);
        Long expiresAt = Instant.now().getEpochSecond() + jwtProperties.ttlSeconds();
        JwtUser me = new JwtUser(companyId, user.getUserId(), user.getRole(), expiresAt);
        return new ConsoleLoginVO(jwtManager.createToken(me), expiresAt,
            ConsoleProfileVO.of(accessService.require(me)));
    }

    public ConsoleProfileVO profile(JwtUser me) {
        return ConsoleProfileVO.of(accessService.require(me));
    }

    @Transactional(rollbackFor = Exception.class)
    public void changePassword(JwtUser me, ConsoleIdentityRequests.PasswordChange request) {
        ConsoleAccess access = accessService.lock(me);
        if (!PasswordHasher.matches(request.oldPassword(), access.user().getPasswordHash())) {
            throw new BizException(ApiEnum.PASSWORD_WRONG);
        }
        users.updatePassword(access.user().getUserId(), request.newPassword());
    }
}
