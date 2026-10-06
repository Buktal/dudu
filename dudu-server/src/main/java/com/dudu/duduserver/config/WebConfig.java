package com.dudu.duduserver.config;

import com.dudu.duduserver.config.auth.AdminGuardInterceptor;
import com.dudu.duduserver.config.auth.AuthInterceptor;
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

    // 全模块唯一放行路径：平台登录端点（无需认证，ADR 0007 写死维护）
    private static final String ADMIN_LOGIN_PATH = "/api/admin/login";

    private final AuthInterceptor authInterceptor;
    private final AdminGuardInterceptor adminGuardInterceptor;
    private final MeResolver meResolver;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authInterceptor)
            .addPathPatterns("/api/**")
            .excludePathPatterns(ADMIN_LOGIN_PATH);
        registry.addInterceptor(adminGuardInterceptor)
            .addPathPatterns("/api/admin/**")
            .excludePathPatterns(ADMIN_LOGIN_PATH);
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(meResolver);
    }
}
