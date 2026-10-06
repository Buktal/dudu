package com.dudu.duduserver.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 开发环境跨域：Admin 前端本地直连（浏览器 127.0.0.1:8080 与 Vite 开发端口不同源），需允许实际来源与预检。
 * 仅 dev profile 生效；生产按部署采用同源反向代理或明确的跨域来源配置（见 docs/design/dudu-admin/api-environments.md）。
 */
@Profile("dev")
@Configuration
public class DevCorsConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
            .allowedOriginPatterns("*")
            .allowedMethods("*")
            .allowedHeaders("Authorization", "Content-Type")
            .maxAge(3600);
    }
}
