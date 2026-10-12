package com.dudu.duduserver.config.auth;

import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * /api/desk/** 模块守卫：只认企业员工身份（带企业归属且角色为 console/user），
 * 平台管理员与不携带企业归属的令牌返回 10106；登录端点在 WebConfig 放行清单中排除。
 * 与 MeResolver 相同的直接解析方式，不共享请求状态（ADR 0007）。
 */
@Component
@RequiredArgsConstructor
public class DeskAuthInterceptor implements HandlerInterceptor {

    private final JwtManager jwtManager;

    @Override
    public boolean preHandle(@NonNull HttpServletRequest request,
                             @NonNull HttpServletResponse response,
                             @NonNull Object handler) {
        JwtUser user = jwtManager.parseAuthorization(request.getHeader(HttpHeaders.AUTHORIZATION));
        if (!user.deskEmployee()) {
            throw new BizException(ApiEnum.FORBIDDEN);
        }
        return true;
    }
}
