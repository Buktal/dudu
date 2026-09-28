package com.dudu.duduserver.config.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * /api/** 默认全拦（default-deny）；放行路径将来在 WebConfig 写死（当前无）。
 * token 取自标准 Authorization: Bearer 头。
 */
@Component
public class TokenInterceptor implements HandlerInterceptor {

    private final JwtManager jwtManager;

    public TokenInterceptor(JwtManager jwtManager) {
        this.jwtManager = jwtManager;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, @NonNull HttpServletResponse response, @NonNull Object handler) {
        jwtManager.parseAuthorization(request.getHeader(HttpHeaders.AUTHORIZATION));
        return true;
    }
}
