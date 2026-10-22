package com.dudu.duduserver.config.auth;

import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * /api/console/** 模块守卫：token 可解析且角色为 console 即放行（与 AdminAuthInterceptor
 * 同构的轻口径）；企业归属与实时管理范围由各服务的 require/lock 全量解析，不共享请求状态（ADR 0007）。
 */
@Component
@RequiredArgsConstructor
public class ConsoleAuthInterceptor implements HandlerInterceptor {

    private final JwtManager jwtManager;

    @Override
    public boolean preHandle(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
                             @NonNull Object handler) {
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        JwtUser user = jwtManager.parseAuthorization(request.getHeader(HttpHeaders.AUTHORIZATION));
        if (user.role() != UserRoleEnum.CONSOLE) {
            throw new BizException(ApiEnum.FORBIDDEN);
        }
        return true;
    }
}
