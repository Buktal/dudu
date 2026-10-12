package com.dudu.duduserver.config;

import com.dudu.duduserver.config.auth.AdminAuthInterceptor;
import com.dudu.duduserver.config.auth.AuthInterceptor;
import com.dudu.duduserver.config.auth.DeskAuthInterceptor;
import com.dudu.duduserver.config.auth.MeResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

    // 公开登录端点：平台与企业的登录入口无需认证（ADR 0007 写死维护）
    private static final String ADMIN_LOGIN_PATH = "/api/admin/login";
    private static final String DESK_LOGIN_PATH = "/api/desk/login";

    // 渠道回调只开放这一条路由，走渠道自身的签名校验，不使用 Desk JWT
    private static final String CHANNEL_CALLBACK_PATH = "/api/channels/*/callback";

    private final AuthInterceptor authInterceptor;
    private final AdminAuthInterceptor adminAuthInterceptor;
    private final DeskAuthInterceptor deskAuthInterceptor;
    private final MeResolver meResolver;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authInterceptor)
            .addPathPatterns("/api/**")
            .excludePathPatterns(ADMIN_LOGIN_PATH, DESK_LOGIN_PATH, CHANNEL_CALLBACK_PATH);
        registry.addInterceptor(adminAuthInterceptor)
            .addPathPatterns("/api/admin/**")
            .excludePathPatterns(ADMIN_LOGIN_PATH);
        registry.addInterceptor(deskAuthInterceptor)
            .addPathPatterns("/api/desk/**")
            .excludePathPatterns(DESK_LOGIN_PATH);
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(meResolver);
    }
}
