package com.dudu.duduserver.config;

import com.dudu.duduserver.socket.DeskSocketHandler;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * Desk 实时网关注册：/ws/desk 走握手后 auth 报文认证（不用 Desk JWT 请求头），
 * 不在 /api/** 拦截链内；来源校验遵循部署层网络边界，本地 Tauri 与 Vite 代理均直连。
 */
@Configuration
@EnableWebSocket
@RequiredArgsConstructor
public class DeskWebSocketConfig implements WebSocketConfigurer {

    private static final String DESK_SOCKET_PATH = "/ws/desk";

    private final DeskSocketHandler deskSocketHandler;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(deskSocketHandler, DESK_SOCKET_PATH)
            .setAllowedOriginPatterns("*");
    }
}
