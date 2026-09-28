package com.dudu.duduserver.config;

import com.dudu.duduserver.config.auth.MeResolver;
import com.dudu.duduserver.config.auth.TokenInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final TokenInterceptor tokenInterceptor;
    private final MeResolver meResolver;

    public WebConfig(TokenInterceptor tokenInterceptor,
            MeResolver meResolver) {
        this.tokenInterceptor = tokenInterceptor;
        this.meResolver = meResolver;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(tokenInterceptor)
                .addPathPatterns("/api/**");
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(meResolver);
    }
}
