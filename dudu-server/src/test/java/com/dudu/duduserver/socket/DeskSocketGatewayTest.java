package com.dudu.duduserver.socket;

import cn.hutool.core.date.DateUtil;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.service.DeskAuthService;
import com.dudu.duduserver.vo.DeskAccessVO;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * DeskSocketGateway 广播循环单元验证：某位员工读取权限遇到基础设施故障（如 DB 抖动）时
 * 只跳过该会话并记录，不把异常外泄给推送调用方、不中断其余会话的接收；
 * 真实 WebSocket 边界的推送验收由 DeskLiveIntegrationTest 覆盖。
 */
class DeskSocketGatewayTest {

    private static final Long COMPANY_ID = 9001L;
    private static final Long CHANNEL_ID = 7L;

    private final DeskAuthService deskAuthService = mock(DeskAuthService.class);
    private final DeskSocketGateway gateway = new DeskSocketGateway(deskAuthService, new ObjectMapper());

    @Test
    void accessReadFailureSkipsOnlyThatSessionAndKeepsBroadcasting() throws Exception {
        WebSocketSession failing = mock(WebSocketSession.class);
        WebSocketSession healthy = mock(WebSocketSession.class);
        when(failing.getId()).thenReturn("session-1");
        when(healthy.getId()).thenReturn("session-2");
        when(failing.isOpen()).thenReturn(true);
        when(healthy.isOpen()).thenReturn(true);
        gateway.register(failing);
        gateway.register(healthy);
        gateway.authenticate("session-1", employee(42L));
        gateway.authenticate("session-2", employee(43L));
        when(deskAuthService.requireAccess(any())).thenAnswer(invocation -> {
            JwtUser user = invocation.getArgument(0);
            if (user.userId() == 42L) {
                throw new DataAccessResourceFailureException("db down");
            }
            return new DeskAccessVO(false, List.of(),
                List.of(new DeskAccessVO.Account("7", "3", ChannelEnum.WECHAT_MP, "公众号")));
        });

        // 权限读取故障不得外泄：另一位员工的会话照常收到本次推送
        gateway.pushMessage(COMPANY_ID, CHANNEL_ID, null, null);

        ArgumentCaptor<TextMessage> captor = ArgumentCaptor.forClass(TextMessage.class);
        verify(healthy, times(1)).sendMessage(captor.capture());
        assertThat(JSONUtil.parseObj(captor.getValue().getPayload()).getStr("type")).isEqualTo("message");
        verify(failing, never()).sendMessage(any());
    }

    @Test
    void authTimeoutClosesOnlySessionStillUnauthenticated() throws Exception {
        WebSocketSession stranger = mock(WebSocketSession.class);
        WebSocketSession employeeSession = mock(WebSocketSession.class);
        WebSocketSession gone = mock(WebSocketSession.class);
        when(stranger.getId()).thenReturn("stranger");
        when(employeeSession.getId()).thenReturn("employee-session");
        when(gone.getId()).thenReturn("gone");
        when(stranger.isOpen()).thenReturn(true);
        when(employeeSession.isOpen()).thenReturn(true);
        when(gone.isOpen()).thenReturn(true);
        gateway.register(stranger);
        gateway.register(employeeSession);
        gateway.register(gone);
        gateway.authenticate("employee-session", employee(51L));
        gateway.remove("gone");

        // 鉴权时限到期：只有始终未认证的连接被关闭，已认证与已离开的不受影响
        gateway.expireAuth("stranger");
        gateway.expireAuth("employee-session");
        gateway.expireAuth("gone");

        verify(stranger, times(1)).close(CloseStatus.POLICY_VIOLATION);
        verify(employeeSession, never()).close(any(CloseStatus.class));
        verify(gone, never()).close(any(CloseStatus.class));
    }

    private JwtUser employee(long userId) {
        return new JwtUser(COMPANY_ID, userId, UserRoleEnum.USER, DateUtil.currentSeconds() + 600);
    }
}
