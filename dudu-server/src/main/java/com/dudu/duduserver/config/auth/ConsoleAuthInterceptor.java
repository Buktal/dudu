package com.dudu.duduserver.config.auth;

import com.dudu.duduserver.service.ConsoleAccessService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Console 每次请求重查持久身份；写服务仍在企业锁后重新授权，不共享请求上下文。
 */
@Component
@RequiredArgsConstructor
public class ConsoleAuthInterceptor implements HandlerInterceptor {
    private final JwtManager jwtManager;
    private final ConsoleAccessService accessService;

    @Override
    public boolean preHandle(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
                             @NonNull Object handler) {
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        accessService.require(jwtManager.parseAuthorization(request.getHeader(HttpHeaders.AUTHORIZATION)));
        return true;
    }
}
