package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.spring.service.impl.ServiceImpl;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.dto.CompanyAdminInitDTO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.mapper.UserMapper;
import com.dudu.duduserver.service.UserService;
import com.dudu.duduserver.util.PasswordCodec;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

/**
 * 用户领域服务实现，SQL 全部经 MyBatis-Plus 通用能力与 Lambda 构造器表达。
 */
@Service
public class UserServiceImpl extends ServiceImpl<UserMapper, UserDO> implements UserService {

    @Override
    public UserDO findPlatformUser(String username) {
        return lambdaQuery()
            .isNull(UserDO::getCompanyId)
            .eq(UserDO::getUsername, username)
            .one();
    }

    @Override
    public UserDO createInitialAdmin(Long companyId, CompanyAdminInitDTO request) {
        UserDO admin = new UserDO();
        admin.setCompanyId(companyId);
        admin.setUsername(request.username());
        admin.setName(request.name() == null || request.name().isBlank() ? request.username() : request.name());
        admin.setPasswordHash(PasswordCodec.hash(request.password()));
        admin.setRole(UserRoleEnum.CONSOLE.code);
        admin.setStatus(EnableStatusEnum.ENABLED.code);
        try {
            save(admin);
        } catch (DuplicateKeyException e) {
            // 登录名在目标作用域内已被占用
            throw new BizException(ApiEnum.DATA_EXIST, "登录名已存在");
        }
        return admin;
    }

    @Override
    public void updatePassword(Long userId, String newPassword) {
        UserDO patch = new UserDO();
        patch.setUserId(userId);
        patch.setPasswordHash(PasswordCodec.hash(newPassword));
        updateById(patch);
    }
}
