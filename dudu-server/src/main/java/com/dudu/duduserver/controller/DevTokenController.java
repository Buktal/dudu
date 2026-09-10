package com.dudu.duduserver.controller;

import com.dudu.duduserver.common.JwtUser;
import com.dudu.duduserver.common.R;
import com.dudu.duduserver.config.auth.JwtManager;
import com.dudu.duduserver.config.auth.JwtProperties;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.exception.DataException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * 仅开发/测试用：按传入身份直发 token（dudu.auth.dev-token-enabled 开关，默认关）。
 * 不查库不做真登录；真登录体系等用户表就绪后另起。
 */
@RestController
public class DevTokenController {

    private final JwtManager jwtManager;
    private final JwtProperties jwtProperties;

    public DevTokenController(JwtManager jwtManager, JwtProperties jwtProperties) {
        this.jwtManager = jwtManager;
        this.jwtProperties = jwtProperties;
    }

    public record DevTokenForm(@NotNull Long userId, @NotBlank String role) {
    }

    @PostMapping("/api/dev/token")
    public R<String> devToken(@Valid @RequestBody DevTokenForm form) {
        if (!jwtProperties.devTokenEnabled()) {
            throw new DataException(ApiEnum.DATA_NOT_ALLOW, "dev token 端点未开启");
        }
        return R.ok(jwtManager.createToken(new JwtUser(form.userId(), form.role())));
    }
}
