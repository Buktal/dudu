package com.dudu.duduserver.socket;

import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.service.DeskAuthService;
import com.dudu.duduserver.vo.DeskAccessVO;
import com.dudu.duduserver.vo.DeskConversationVO;
import com.dudu.duduserver.vo.DeskMessageVO;
import com.dudu.duduserver.vo.DeskVisitorProfileVO;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;

import java.io.IOException;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Desk 实时网关：按员工维护多个已连接会话（多设备），只向认证成功且当前有权的
 * 已连接员工推送契约第 5 节报文；已接入 message、conversation 与 profile 报文
 * （消息引起的访客更新合并在 message 中），access-changed 由后续票接入。没有 eventId、
 * ack 与持久游标，未认证会话与离线员工不接收业务数据。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DeskSocketGateway {

    // 单会话发送阻塞时限与缓冲上限，由并发会话装饰器串行化发送并在超限时关闭该会话
    private static final int SEND_TIME_LIMIT_MS = 10_000;
    private static final int SEND_BUFFER_SIZE_LIMIT = 512 * 1024;

    private final DeskAuthService deskAuthService;
    private final ObjectMapper objectMapper;

    private final Map<String, ConnectedSession> sessions = new ConcurrentHashMap<>();

    // 已连接会话：认证前用户为空，不参与业务推送
    private record ConnectedSession(WebSocketSession session, JwtUser user) {
    }

    // 连接建立即登记；认证成功的会话才携带员工身份
    public void register(WebSocketSession session) {
        sessions.put(session.getId(), new ConnectedSession(decorate(session), null));
    }

    // auth 报文校验通过后登记员工身份
    public void authenticate(String sessionId, JwtUser user) {
        sessions.computeIfPresent(sessionId, (id, entry) -> new ConnectedSession(entry.session(), user));
    }

    // 已认证员工，未认证或已断开返回 null
    public JwtUser user(String sessionId) {
        ConnectedSession entry = sessions.get(sessionId);
        return entry == null ? null : entry.user();
    }

    public void remove(String sessionId) {
        sessions.remove(sessionId);
    }

    // 发送单条报文；连接已失效时只清理会话，不影响调用方
    public void send(String sessionId, Object frame) {
        ConnectedSession entry = sessions.get(sessionId);
        if (entry == null) {
            return;
        }
        send(entry, serialize(frame));
    }

    public void close(String sessionId, CloseStatus status) {
        ConnectedSession entry = sessions.get(sessionId);
        if (entry == null) {
            return;
        }
        sessions.remove(sessionId);
        try {
            entry.session().close(status);
        } catch (IOException e) {
            log.warn("[desk-socket] 关闭会话失败, sessionId={}", sessionId, e);
        }
    }

    /**
     * 推送一条来信：只发给当前有权接待该账号的已连接员工（含发送者本人），
     * 推送前按持久数据复核员工启用状态与接待范围；推送失败不改变已提交的业务数据。
     */
    public void pushMessage(Long companyId, Long companyChannelId, DeskMessageVO message, DeskConversationVO conversation) {
        Map<String, Object> frame = new LinkedHashMap<>();
        frame.put("type", "message");
        frame.put("message", message);
        frame.put("conversation", conversation);
        broadcast(companyId, companyChannelId, frame);
    }

    /**
     * 推送一条会话状态变更（结束 / 继续）：只发完整会话对象，不含发送者个人字段；
     * 发给当前有权接待该账号的已连接员工（含操作者本人）。
     */
    public void pushConversation(Long companyId, Long companyChannelId, DeskConversationVO conversation) {
        Map<String, Object> frame = new LinkedHashMap<>();
        frame.put("type", "conversation");
        frame.put("conversation", conversation);
        broadcast(companyId, companyChannelId, frame);
    }

    /**
     * 推送一张名片变更（渠道资料或共享标签/备注保存后）：只发完整名片对象；
     * 发给当前有权接待该账号的已连接员工（含操作者本人）。
     */
    public void pushProfile(Long companyId, Long companyChannelId, DeskVisitorProfileVO profile) {
        Map<String, Object> frame = new LinkedHashMap<>();
        frame.put("type", "profile");
        frame.put("profile", profile);
        broadcast(companyId, companyChannelId, frame);
    }

    // 按当前持久数据复核员工启用状态与接待范围后逐会话发送；同一员工的权限只解析一次
    private void broadcast(Long companyId, Long companyChannelId, Map<String, Object> frame) {
        String payload = serialize(frame);
        Map<Long, Boolean> accessByUser = new HashMap<>();
        for (Map.Entry<String, ConnectedSession> item : sessions.entrySet()) {
            ConnectedSession entry = item.getValue();
            if (entry.user() == null || !companyId.equals(entry.user().companyId())) {
                continue;
            }
            boolean allowed = accessByUser.computeIfAbsent(entry.user().userId(),
                userId -> canAccess(entry.user(), companyChannelId));
            if (allowed) {
                send(entry, payload);
            }
        }
    }

    // 权限按当前持久数据实时读取；员工停用或身份失效时该会话不再接收数据
    private boolean canAccess(JwtUser user, Long companyChannelId) {
        try {
            DeskAccessVO access = deskAuthService.requireAccess(user);
            return access.accounts().stream()
                .anyMatch(account -> account.companyChannelId().equals(String.valueOf(companyChannelId)));
        } catch (BizException e) {
            return false;
        }
    }

    private void send(ConnectedSession entry, String payload) {
        try {
            entry.session().sendMessage(new TextMessage(payload));
        } catch (IOException | RuntimeException e) {
            log.warn("[desk-socket] 推送失败, sessionId={}", entry.session().getId(), e);
            sessions.remove(entry.session().getId());
        }
    }

    private String serialize(Object frame) {
        try {
            return objectMapper.writeValueAsString(frame);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Desk 推送报文序列化失败", e);
        }
    }

    // 并发会话装饰器：同一会话的发送串行化，避免多线程同时写一个 WebSocket
    private WebSocketSession decorate(WebSocketSession session) {
        return new ConcurrentWebSocketSessionDecorator(session, SEND_TIME_LIMIT_MS, SEND_BUFFER_SIZE_LIMIT);
    }
}
