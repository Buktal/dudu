package com.dudu.duduserver.socket;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.config.auth.JwtManager;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.service.DeskAuthService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * /ws/desk 网关处理器：连接后客户端先发 {"type":"auth","token":…}，服务端沿用 HTTP 相同的
 * 令牌校验、员工启用与企业权限规则，成功回 {"type":"ready"}，失败按业务码回 error 后关闭；
 * 未认证连接不接收业务数据。本票只处理 auth 报文，业务报文由服务端单向推送。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DeskSocketHandler extends TextWebSocketHandler {

    private static final String AUTH_TYPE = "auth";

    // 令牌缺失、无效与过期统一按契约归为登录状态无效
    private static final Set<ApiEnum> TOKEN_FAILURES =
        Set.of(ApiEnum.TOKEN_EMPTY, ApiEnum.TOKEN_VERIFY, ApiEnum.TOKEN_EXPIRE);

    private final JwtManager jwtManager;
    private final DeskAuthService deskAuthService;
    private final DeskSocketGateway gateway;

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        gateway.register(session);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        String sessionId = session.getId();
        if (gateway.user(sessionId) != null) {
            // 认证后本票不接收客户端业务报文，也不订阅业务数据
            return;
        }
        JSONObject frame = parse(message.getPayload());
        if (frame == null || !AUTH_TYPE.equals(frame.getStr("type"))) {
            reject(sessionId, ApiEnum.TOKEN_VERIFY);
            return;
        }
        try {
            JwtUser user = jwtManager.parseToken(frame.getStr("token"));
            if (!user.deskEmployee()) {
                throw new BizException(ApiEnum.FORBIDDEN);
            }
            // 员工启用状态与企业归属复用接待范围解析，失败即身份无效
            deskAuthService.requireAccess(user);
            gateway.authenticate(sessionId, user);
            gateway.send(sessionId, Map.of("type", "ready"));
        } catch (BizException e) {
            reject(sessionId, authFailure(e));
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        gateway.remove(session.getId());
    }

    // 返回 error 报文并关闭连接；其他身份错误沿用相应业务码
    private void reject(String sessionId, ApiEnum reason) {
        Map<String, Object> frame = new LinkedHashMap<>();
        frame.put("type", "error");
        frame.put("code", reason.code);
        frame.put("msg", reason.desc);
        gateway.send(sessionId, frame);
        gateway.close(sessionId, CloseStatus.NORMAL);
        log.info("[desk-socket] 认证拒绝, sessionId={}, code={}", sessionId, reason.code);
    }

    private ApiEnum authFailure(BizException failure) {
        return TOKEN_FAILURES.contains(failure.apiEnum()) ? ApiEnum.TOKEN_VERIFY : failure.apiEnum();
    }

    private JSONObject parse(String payload) {
        try {
            return JSONUtil.parseObj(payload);
        } catch (RuntimeException e) {
            return null;
        }
    }
}
