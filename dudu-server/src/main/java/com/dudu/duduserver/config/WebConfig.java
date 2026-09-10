package com.dudu.duduserver.config;

import com.dudu.duduserver.config.auth.CurrentUserArgumentResolver;
import com.dudu.duduserver.config.auth.JwtProperties;
import com.dudu.duduserver.config.auth.TokenInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final TokenInterceptor tokenInterceptor;
    private final CurrentUserArgumentResolver currentUserArgumentResolver;
    private final JwtProperties jwtProperties;

    public WebConfig(TokenInterceptor tokenInterceptor,
            CurrentUserArgumentResolver currentUserArgumentResolver,
            JwtProperties jwtProperties) {
        this.tokenInterceptor = tokenInterceptor;
        this.currentUserArgumentResolver = currentUserArgumentResolver;
        this.jwtProperties = jwtProperties;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(tokenInterceptor)
                .addPathPatterns("/api/**")
                .excludePathPatterns(jwtProperties.whitelist());
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(currentUserArgumentResolver);
    }
}
