package com.dudu.duduserver.socket;

import cn.hutool.core.date.DateUtil;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.config.auth.JwtManager;
import com.dudu.duduserver.config.auth.JwtProperties;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.service.DeskAuthService;
import com.dudu.duduserver.vo.DeskAccessVO;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * /ws/desk 认证报文单元验证：ready 与 error 报文、关闭行为、未认证不登记推送身份；
 * 多设备推送与权限复核由 DeskLiveIntegrationTest 用真实 WebSocket 客户端覆盖。
 */
class DeskSocketHandlerTest {

    private static final String SESSION_ID = "session-1";
    private static final Long COMPANY_ID = 9001L;

    private final DeskAuthService deskAuthService = mock(DeskAuthService.class);
    private final JwtManager jwtManager = new JwtManager(new JwtProperties("socket-test-secret", null));
    private final DeskSocketGateway gateway = new DeskSocketGateway(deskAuthService, new ObjectMapper());
    private final DeskSocketHandler handler = new DeskSocketHandler(jwtManager, deskAuthService, gateway);

    private final WebSocketSession session = mock(WebSocketSession.class);

    @BeforeEach
    void openSession() throws Exception {
        when(session.getId()).thenReturn(SESSION_ID);
        when(session.isOpen()).thenReturn(true);
        handler.afterConnectionEstablished(session);
    }

    @Test
    void validEmployeeTokenReceivesReadyAndRegistersPushIdentity() throws Exception {
        when(deskAuthService.requireAccess(any()))
            .thenReturn(new DeskAccessVO(false, List.of(),
                List.of(new DeskAccessVO.Account("7", "3", ChannelEnum.WECHAT_MP, "公众号"))));

        handler.handleTextMessage(session, auth(employeeToken()));

        assertThat(sentFrames().get(0).getStr("type")).isEqualTo("ready");
        assertThat(gateway.user(SESSION_ID)).isNotNull();
    }

    @Test
    void invalidTokenReceivesErrorFrameAndClose() throws Exception {
        handler.handleTextMessage(session, auth("not-a-token"));

        JSONObject error = sentFrames().get(0);
        assertThat(error.getStr("type")).isEqualTo("error");
        assertThat(error.getInt("code")).isEqualTo(10102);
        assertThat(error.getStr("msg")).isEqualTo("登录状态无效，请重新登录");
        verify(session).close(CloseStatus.NORMAL);
        assertThat(gateway.user(SESSION_ID)).isNull();
    }

    @Test
    void platformAdminTokenKeepsForbiddenBusinessCode() throws Exception {
        String adminToken = jwtManager.createToken(
            new JwtUser(null, 3L, UserRoleEnum.ADMIN, DateUtil.currentSeconds() + 600));

        handler.handleTextMessage(session, auth(adminToken));

        assertThat(sentFrames().get(0).getInt("code")).isEqualTo(10106);
        assertThat(gateway.user(SESSION_ID)).isNull();
    }

    @Test
    void disabledEmployeeIsReportedAsInvalidLogin() throws Exception {
        when(deskAuthService.requireAccess(any())).thenThrow(new BizException(ApiEnum.TOKEN_VERIFY));

        handler.handleTextMessage(session, auth(employeeToken()));

        assertThat(sentFrames().get(0).getInt("code")).isEqualTo(10102);
        assertThat(gateway.user(SESSION_ID)).isNull();
    }

    @Test
    void nonAuthFirstFrameIsRejectedAndClosed() throws Exception {
        handler.handleTextMessage(session, new TextMessage("{\"type\":\"message\"}"));

        assertThat(sentFrames().get(0).getInt("code")).isEqualTo(10102);
        verify(session).close(CloseStatus.NORMAL);
        assertThat(gateway.user(SESSION_ID)).isNull();
    }

    @Test
    void authenticatedSessionIgnoresFurtherClientFrames() throws Exception {
        when(deskAuthService.requireAccess(any()))
            .thenReturn(new DeskAccessVO(true, List.of(), List.of()));
        handler.handleTextMessage(session, auth(employeeToken()));
        assertThat(sentFrames().get(0).getStr("type")).isEqualTo("ready");

        // 认证后客户端业务报文不触发任何应答或推送
        handler.handleTextMessage(session, new TextMessage("{\"type\":\"message\"}"));
        verify(session, times(1)).sendMessage(any());
        verify(session, never()).close(CloseStatus.NORMAL);
    }

    private String employeeToken() {
        return jwtManager.createToken(new JwtUser(COMPANY_ID, 42L, UserRoleEnum.USER, DateUtil.currentSeconds() + 600));
    }

    private TextMessage auth(String token) {
        return new TextMessage("{\"type\":\"auth\",\"token\":\"" + token + "\"}");
    }

    private List<JSONObject> sentFrames() {
        ArgumentCaptor<TextMessage> captor = ArgumentCaptor.forClass(TextMessage.class);
        try {
            verify(session, atLeastOnce()).sendMessage(captor.capture());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        return captor.getAllValues().stream().map(message -> JSONUtil.parseObj(message.getPayload())).toList();
    }
}
