package com.dudu.duduserver.config;

import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.service.UserService;
import com.dudu.duduserver.util.PasswordCodec;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * 首个平台管理员初始化：库中无平台账号时以内置凭据创建，不开放自注册（部署期显式初始化）。
 * 已存在时跳过；幂等，可随服务重启重复执行。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AdminInitializer implements ApplicationRunner {

    // 内置初始化凭据（与前端登录表单预填约定一致，非生产凭据），首登后经改密接口更换
    private static final String INIT_USERNAME = "Admin";
    private static final String INIT_PASSWORD = "Admin";

    private final UserService userService;

    @Override
    public void run(ApplicationArguments args) {
        boolean exists = userService.lambdaQuery()
            .eq(UserDO::getRole, UserRoleEnum.ADMIN.code)
            .isNull(UserDO::getCompanyId)
            .count() > 0;
        if (exists) {
            return;
        }

        UserDO admin = new UserDO();
        admin.setUsername(INIT_USERNAME);
        admin.setName(INIT_USERNAME);
        admin.setPasswordHash(PasswordCodec.hash(INIT_PASSWORD));
        admin.setRole(UserRoleEnum.ADMIN.code);
        admin.setStatus(EnableStatusEnum.ENABLED.code);
        userService.save(admin);
        log.info("[admin-init] 平台管理员已初始化, username={}", INIT_USERNAME);
    }
}
