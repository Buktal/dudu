package com.dudu.duduserver.service.impl;

import cn.hutool.core.date.DateUtil;
import com.dudu.duduserver.config.auth.JwtManager;
import com.dudu.duduserver.config.auth.JwtProperties;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.*;
import com.dudu.duduserver.dto.AdminPasswordChangeDTO;
import com.dudu.duduserver.dto.AdminLoginDTO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.service.AuthService;
import com.dudu.duduserver.service.OperationLogService;
import com.dudu.duduserver.service.UserService;
import com.dudu.duduserver.util.PasswordCodec;
import com.dudu.duduserver.vo.AdminDetailVO;
import com.dudu.duduserver.vo.AdminLoginVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 认证与个人账号服务实现。
 */
@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {

    private final UserService userService;
    private final OperationLogService operationLogService;
    private final JwtManager jwtManager;
    private final JwtProperties jwtProperties;

    @Override
    public AdminLoginVO login(AdminLoginDTO request) {
        UserDO user = userService.findPlatformUser(request.username());
        if (user == null || !PasswordCodec.matches(request.password(), user.getPasswordHash())) {
            throw new BizException(ApiEnum.LOGIN_FAILED);
        }
        if (!UserRoleEnum.ADMIN.code.equals(user.getRole())
            || user.getStatus() == null || user.getStatus() != EnableStatusEnum.ENABLED.code) {
            throw new BizException(ApiEnum.LOGIN_FAILED);
        }

        Long exp = DateUtil.currentSeconds() + jwtProperties.ttlSeconds();
        String token = jwtManager.createToken(new JwtUser(null, user.getUserId(), user.getRole(), exp));
        return new AdminLoginVO(token, exp, AdminDetailVO.of(user));
    }

    @Override
    public AdminDetailVO getDetail(JwtUser me) {
        UserDO user = userService.getById(me.userId());
        if (user == null) {
            throw new BizException(ApiEnum.DATA_NOT_EXIST, "账号不存在");
        }
        return AdminDetailVO.of(user);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updatePassword(JwtUser me, AdminPasswordChangeDTO request) {
        UserDO user = userService.getById(me.userId());
        if (user == null) {
            throw new BizException(ApiEnum.DATA_NOT_EXIST, "账号不存在");
        }
        if (!PasswordCodec.matches(request.oldPassword(), user.getPasswordHash())) {
            throw new BizException(ApiEnum.PASSWORD_WRONG);
        }
        userService.updatePassword(user.getUserId(), request.newPassword());
        operationLogService.appendSuccess(user.getUserId(), null, OperationActionEnum.ADMIN_PASSWORD_CHANGE,
            TargetTypeEnum.USER, user.getUserId(), "修改自己的密码");
    }
}
