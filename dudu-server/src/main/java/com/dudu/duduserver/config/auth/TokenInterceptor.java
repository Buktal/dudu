package com.dudu.duduserver.config.auth;

import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.exception.BizException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.Optional;

/**
 * /api/** 默认全拦（default-deny），白名单由 WebConfig 按 dudu.auth.whitelist 排除。
 * token 取自标准 Authorization: Bearer 头。
 */
@Component
public class TokenInterceptor implements HandlerInterceptor {

    public static final String ATTR_CURRENT_USER = "dudu.currentUser";

    private final JwtManager jwtManager;

    public TokenInterceptor(JwtManager jwtManager) {
        this.jwtManager = jwtManager;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String token = Optional.ofNullable(request.getHeader("Authorization"))
                .filter(header -> header.startsWith("Bearer "))
                .map(header -> header.substring("Bearer ".length()))
                .orElseThrow(() -> new BizException(ApiEnum.TOKEN_EMPTY));
        request.setAttribute(ATTR_CURRENT_USER, jwtManager.parseToken(token));
        return true;
    }
}
