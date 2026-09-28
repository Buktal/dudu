package com.dudu.duduserver.config.auth;

import cn.hutool.core.date.DateUtil;
import cn.hutool.json.JSONUtil;
import cn.hutool.jwt.JWT;
import cn.hutool.jwt.JWTUtil;
import cn.hutool.jwt.JWTValidator;
import cn.hutool.jwt.signers.JWTSignerUtil;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.config.exception.BizException;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

/**
 * 签发/验签与 payload 读写全部走 Hutool：实体转 JSONUtil.parseObj 签发，toBean 直接绑定解析。
 * 过期 exp 为 JwtUser 字段，校验用 epoch 秒。
 */
@Component
public class JwtManager {

    private final byte[] key;

    public JwtManager(JwtProperties properties) {
        this.key = properties.jwtSecret().getBytes(StandardCharsets.UTF_8);
    }

    public String createToken(JwtUser user) {
        return JWTUtil.createToken(JSONUtil.parseObj(user), key);
    }

    public JwtUser parseAuthorization(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw new BizException(ApiEnum.TOKEN_EMPTY);
        }
        return parseToken(authorization.substring("Bearer ".length()));
    }

    public JwtUser parseToken(String token) {
        if (token == null || token.isBlank()) {
            throw new BizException(ApiEnum.TOKEN_EMPTY);
        }

        JwtUser user;
        try {
            JWT jwt = JWT.of(token);
            JWTValidator.of(jwt).validateAlgorithm(JWTSignerUtil.hs256(key));
            user = jwt.getPayloads().toBean(JwtUser.class);
        } catch (RuntimeException e) {
            // 畸形 JSON、签名/算法错误和载荷类型错误统一归为无效 token。
            throw new BizException(ApiEnum.TOKEN_VERIFY);
        }

        if (user == null || user.userId() == null) {
            throw new BizException(ApiEnum.TOKEN_VERIFY);
        }
        if (user.exp() == null || DateUtil.currentSeconds() >= user.exp()) {
            throw new BizException(ApiEnum.TOKEN_EXPIRE);
        }
        return user;
    }
}
