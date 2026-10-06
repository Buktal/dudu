package com.dudu.duduserver.config.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.cors.CorsUtils;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * /api/** 默认全拦（default-deny）；放行路径在 WebConfig 写死（当前仅平台登录端点）。
 * token 取自标准 Authorization: Bearer 头。
 */
@Component
@RequiredArgsConstructor
public class AuthInterceptor implements HandlerInterceptor {

    private final JwtManager jwtManager;

    @Override
    public boolean preHandle(@NonNull HttpServletRequest request,
                             @NonNull HttpServletResponse response,
                             @NonNull Object handler) {
        // 预检请求不携带凭据，放行交由 CORS 处理；实际请求仍须通过 token 校验
        if (CorsUtils.isPreFlightRequest(request)) {
            return true;
        }
        jwtManager.parseAuthorization(request.getHeader(HttpHeaders.AUTHORIZATION));
        return true;
    }
}
