package com.dudu.duduserver.controller.desk;

import cn.hutool.core.date.DateUtil;
import com.dudu.duduserver.common.R;
import com.dudu.duduserver.config.auth.JwtManager;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.auth.Me;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.constant.VisitorQueryOrderEnum;
import com.dudu.duduserver.constant.VisitorQueryStatusEnum;
import com.dudu.duduserver.constant.VisitorStatusEnum;
import com.dudu.duduserver.dto.DeskHistoryQueryDTO;
import com.dudu.duduserver.dto.DeskLoginDTO;
import com.dudu.duduserver.dto.DeskStatusDTO;
import com.dudu.duduserver.dto.DeskVisitorQueryDTO;
import com.dudu.duduserver.service.DeskAuthService;
import com.dudu.duduserver.testutil.NoDatasourceSpringTest;
import com.dudu.duduserver.vo.DeskAccessVO;
import com.dudu.duduserver.vo.DeskCapabilityVO;
import com.dudu.duduserver.vo.DeskCompanyVO;
import com.dudu.duduserver.vo.DeskConversationVO;
import com.dudu.duduserver.vo.DeskLoginVO;
import com.dudu.duduserver.vo.DeskMessagePageVO;
import com.dudu.duduserver.vo.DeskMessageVO;
import com.dudu.duduserver.vo.DeskProfileVO;
import com.dudu.duduserver.vo.DeskUserVO;
import com.dudu.duduserver.vo.DeskVisitorIdentityVO;
import com.dudu.duduserver.vo.DeskVisitorPageVO;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Desk 模块 HTTP 契约验证：登录放行、企业员工守卫与成功投影走真实装配，
 * 领域服务以 Mockito 替身返回固定结果（服务分支由 DeskAuthServiceTest 覆盖，SQL 由本地 MySQL 验收覆盖）。
 */
@AutoConfigureMockMvc
@Import(DeskApiTest.DeskPingController.class)
class DeskApiTest extends NoDatasourceSpringTest {

    // 测试用 Desk 资源：验证 /api/desk/** 的企业员工守卫，而非某一个控制器的实现
    @RestController
    static class DeskPingController {

        @GetMapping("/api/desk/ping")
        R<JwtUser> ping(@Me JwtUser user) {
            return R.ok(user);
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtManager jwtManager;

    @Test
    void deskLoginIsPublicAndReturnsEmployeeProjection() throws Exception {
        when(deskAuthService.login(any(DeskLoginDTO.class))).thenReturn(loginResult());

        mockMvc.perform(post("/api/desk/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"companyId": "783101", "username": "boss", "password": "password123"}
                    """))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.code").value(ApiEnum.OK.code))
            .andExpect(jsonPath("$.data.token").value("issued-token"))
            .andExpect(jsonPath("$.data.exp").value(1800))
            .andExpect(jsonPath("$.data.user.userId").value("9"))
            .andExpect(jsonPath("$.data.user.username").value("boss"))
            .andExpect(jsonPath("$.data.user.name").value("老板"))
            .andExpect(jsonPath("$.data.user.role").value("console"))
            .andExpect(jsonPath("$.data.company.companyId").value("783101"))
            .andExpect(jsonPath("$.data.company.companyName").value("验收企业"))
            .andExpect(jsonPath("$.data.access.allGroups").value(true))
            .andExpect(jsonPath("$.data.access.groups[0].groupId").value("31"))
            .andExpect(jsonPath("$.data.access.groups[0].groupName").value("售前"))
            .andExpect(jsonPath("$.data.access.accounts[0].companyChannelId").value("51"))
            .andExpect(jsonPath("$.data.access.accounts[0].groupId").value("31"))
            .andExpect(jsonPath("$.data.access.accounts[0].channel").value("wechat"))
            .andExpect(jsonPath("$.data.access.accounts[0].accountName").value("公众号"))
            .andExpect(jsonPath("$.data.access.accounts[0].channelInfo").doesNotExist());

        ArgumentCaptor<DeskLoginDTO> captor = ArgumentCaptor.forClass(DeskLoginDTO.class);
        verify(deskAuthService).login(captor.capture());
        assertThat(captor.getValue().companyId()).isEqualTo("783101");
        assertThat(captor.getValue().username()).isEqualTo("boss");
        assertThat(captor.getValue().password()).isEqualTo("password123");
    }

    @Test
    void deskResourcesRejectMissingTokenWhileLoginStaysPublic() throws Exception {
        mockMvc.perform(get("/api/desk/profile"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.TOKEN_EMPTY.code));
        mockMvc.perform(post("/api/desk/logout"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.TOKEN_EMPTY.code));

        when(deskAuthService.login(any(DeskLoginDTO.class))).thenReturn(loginResult());
        mockMvc.perform(post("/api/desk/login")
                .header("Authorization", "Bearer not-a-token")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"companyId": "783101", "username": "boss", "password": "password123"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.OK.code));
    }

    @Test
    void deskResourcesRejectPlatformIdentityWithForbidden() throws Exception {
        mockMvc.perform(get("/api/desk/ping").header("Authorization", bearer(null, 1L, UserRoleEnum.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.FORBIDDEN.code));
        // 角色与载荷不一致的令牌同样不是企业员工身份
        mockMvc.perform(get("/api/desk/ping").header("Authorization", bearer(783101L, 9L, UserRoleEnum.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.FORBIDDEN.code));
        mockMvc.perform(get("/api/desk/profile")
                .header("Authorization", bearer(null, 1L, UserRoleEnum.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.FORBIDDEN.code));
        mockMvc.perform(post("/api/desk/logout")
                .header("Authorization", bearer(783101L, 9L, UserRoleEnum.USER)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.OK.code));
        verify(deskAuthService, never()).getProfile(any(JwtUser.class));
    }

    @Test
    void deskResourcesAcceptCompanyEmployeeIdentity() throws Exception {
        when(deskAuthService.getProfile(any(JwtUser.class))).thenReturn(profileResult());
        String token = bearer(783101L, 9L, UserRoleEnum.CONSOLE);

        mockMvc.perform(get("/api/desk/ping").header("Authorization", token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.OK.code))
            .andExpect(jsonPath("$.data.companyId").value(783101));
        mockMvc.perform(get("/api/desk/profile").header("Authorization", token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.OK.code))
            .andExpect(jsonPath("$.data.user.userId").value("9"))
            .andExpect(jsonPath("$.data.user.role").value("console"))
            .andExpect(jsonPath("$.data.company.companyId").value("783101"))
            .andExpect(jsonPath("$.data.access.allGroups").value(false))
            .andExpect(jsonPath("$.data.access.groups").isArray())
            .andExpect(jsonPath("$.data.access.groups").isEmpty())
            .andExpect(jsonPath("$.data.token").doesNotExist());
        mockMvc.perform(post("/api/desk/logout").header("Authorization", token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.OK.code))
            .andExpect(jsonPath("$.data").doesNotExist());
    }

    @Test
    void deskVisitorEndpointsAreGuardedAndReturnContractEnvelope() throws Exception {
        when(deskVisitorService.query(any(JwtUser.class), any(DeskVisitorQueryDTO.class)))
            .thenReturn(pageResult());
        when(deskVisitorService.get(any(JwtUser.class), anyString())).thenReturn(conversationResult());
        String token = bearer(783101L, 9L, UserRoleEnum.CONSOLE);

        // 访客资源落在 /api/desk/** 的企业员工守卫内：缺令牌与平台身份都不得进入服务
        mockMvc.perform(post("/api/desk/visitors/query"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.TOKEN_EMPTY.code));
        mockMvc.perform(get("/api/desk/visitors/41").header("Authorization", bearer(null, 1L, UserRoleEnum.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.FORBIDDEN.code));
        verify(deskVisitorService, never()).query(any(JwtUser.class), any(DeskVisitorQueryDTO.class));

        mockMvc.perform(post("/api/desk/visitors/query").header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"search": " 林 ", "channelId": "wechat", "status": "all", "order": "messages", "page": 2, "pageSize": 5}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.OK.code))
            .andExpect(jsonPath("$.data.items[0].id").value("41"))
            .andExpect(jsonPath("$.data.items[0].identity.externalUserId").value("external-a"))
            .andExpect(jsonPath("$.data.items[0].identity.name").value("林小满"))
            .andExpect(jsonPath("$.data.items[0].identity.channelId").value("wechat"))
            .andExpect(jsonPath("$.data.items[0].identity.channelName").value("微信"))
            .andExpect(jsonPath("$.data.items[0].identity.accountId").value("51"))
            .andExpect(jsonPath("$.data.items[0].identity.accountName").value("公众号"))
            .andExpect(jsonPath("$.data.items[0].preview").value("最后一条摘要"))
            .andExpect(jsonPath("$.data.items[0].waitingSince").doesNotExist())
            .andExpect(jsonPath("$.data.items[0].messageCount").value(7))
            .andExpect(jsonPath("$.data.items[0].version").value(3))
            .andExpect(jsonPath("$.data.items[0].capability.state").value("restricted"))
            .andExpect(jsonPath("$.data.total").value(1))
            .andExpect(jsonPath("$.data.page").value(2))
            .andExpect(jsonPath("$.data.pageSize").value(5))
            .andExpect(jsonPath("$.data.counts.active").value(4))
            .andExpect(jsonPath("$.data.counts.needsReply").value(3))
            .andExpect(jsonPath("$.data.counts.waiting").value(1))
            .andExpect(jsonPath("$.data.counts.closed").value(2))
            .andExpect(jsonPath("$.data.channels[0].id").value("wechat"))
            .andExpect(jsonPath("$.data.channels[0].name").value("微信"));

        ArgumentCaptor<DeskVisitorQueryDTO> captor = ArgumentCaptor.forClass(DeskVisitorQueryDTO.class);
        verify(deskVisitorService).query(any(JwtUser.class), captor.capture());
        assertThat(captor.getValue().search()).isEqualTo("林");
        assertThat(captor.getValue().channelId()).isEqualTo("wechat");
        assertThat(captor.getValue().status()).isEqualTo(VisitorQueryStatusEnum.ALL);
        assertThat(captor.getValue().order()).isEqualTo(VisitorQueryOrderEnum.MESSAGES);
        assertThat(captor.getValue().page()).isEqualTo(2);
        assertThat(captor.getValue().pageSize()).isEqualTo(5);

        // 查询体可省略：缺省值在服务端归一
        mockMvc.perform(post("/api/desk/visitors/query").header("Authorization", token))
            .andExpect(jsonPath("$.code").value(ApiEnum.OK.code));
        ArgumentCaptor<DeskVisitorQueryDTO> defaulted = ArgumentCaptor.forClass(DeskVisitorQueryDTO.class);
        verify(deskVisitorService, times(2)).query(any(JwtUser.class), defaulted.capture());
        assertThat(defaulted.getValue().search()).isEmpty();
        assertThat(defaulted.getValue().channelId()).isEqualTo("all");
        assertThat(defaulted.getValue().status()).isEqualTo(VisitorQueryStatusEnum.ACTIVE);
        assertThat(defaulted.getValue().order()).isEqualTo(VisitorQueryOrderEnum.WAIT);
        assertThat(defaulted.getValue().page()).isEqualTo(1);
        assertThat(defaulted.getValue().pageSize()).isEqualTo(30);

        mockMvc.perform(get("/api/desk/visitors/41").header("Authorization", token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.OK.code))
            .andExpect(jsonPath("$.data.id").value("41"))
            .andExpect(jsonPath("$.data.identity.name").value("林小满"))
            .andExpect(jsonPath("$.data.updatedAt").value("2026-10-12 10:30:15"))
            .andExpect(jsonPath("$.data.waitingSince").doesNotExist());
        verify(deskVisitorService).get(any(JwtUser.class), eq("41"));
    }

    @Test
    void deskVisitorHistoryAcceptsOptionalPagingParametersAndReturnsTheContractEnvelope() throws Exception {
        when(deskVisitorService.history(any(JwtUser.class), anyString(), any(DeskHistoryQueryDTO.class)))
            .thenReturn(historyResult());
        String token = bearer(783101L, 9L, UserRoleEnum.CONSOLE);

        mockMvc.perform(get("/api/desk/visitors/41/messages").header("Authorization", token)
                .param("beforeSequence", "51").param("limit", "30"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.OK.code))
            .andExpect(jsonPath("$.data.items[0].id").value("41"))
            .andExpect(jsonPath("$.data.items[0].conversationId").value("41"))
            .andExpect(jsonPath("$.data.items[0].direction").value("incoming"))
            .andExpect(jsonPath("$.data.items[0].body.type").value("text"))
            .andExpect(jsonPath("$.data.items[0].body.text").value("还想问问保修"))
            .andExpect(jsonPath("$.data.items[0].createdAt").value("2026-10-12 09:10:00"))
            .andExpect(jsonPath("$.data.items[0].sequence").value(7))
            .andExpect(jsonPath("$.data.items[0].version").value(1))
            .andExpect(jsonPath("$.data.items[0].senderUserId").doesNotExist())
            .andExpect(jsonPath("$.data.items[0].delivery").doesNotExist())
            .andExpect(jsonPath("$.data.items[1].senderUserId").value("9"))
            .andExpect(jsonPath("$.data.items[1].senderName").value("老板"))
            .andExpect(jsonPath("$.data.items[1].clientRequestId").value("client-1"))
            .andExpect(jsonPath("$.data.items[1].delivery.state").value("sent"))
            .andExpect(jsonPath("$.data.nextCursor").value("8"));
        ArgumentCaptor<DeskHistoryQueryDTO> captor = ArgumentCaptor.forClass(DeskHistoryQueryDTO.class);
        verify(deskVisitorService).history(any(JwtUser.class), eq("41"), captor.capture());
        assertThat(captor.getValue().beforeSequence()).isEqualTo("51");
        assertThat(captor.getValue().limit()).isEqualTo("30");

        // 两个参数都可省略：缺省在服务层归一为最近一页
        mockMvc.perform(get("/api/desk/visitors/41/messages").header("Authorization", token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.OK.code));
        verify(deskVisitorService, times(2)).history(any(JwtUser.class), eq("41"), captor.capture());
        assertThat(captor.getValue().beforeSequence()).isNull();
        assertThat(captor.getValue().limit()).isNull();

        // 未认证与平台身份都不得进入服务
        mockMvc.perform(get("/api/desk/visitors/41/messages"))
            .andExpect(jsonPath("$.code").value(ApiEnum.TOKEN_EMPTY.code));
        mockMvc.perform(get("/api/desk/visitors/41/messages")
                .header("Authorization", bearer(null, 1L, UserRoleEnum.ADMIN)))
            .andExpect(jsonPath("$.code").value(ApiEnum.FORBIDDEN.code));
        verify(deskVisitorService, times(2)).history(any(JwtUser.class), anyString(), any(DeskHistoryQueryDTO.class));
    }

    @Test
    void deskVisitorStatusAcceptsPutAndReturnsTheConversationEnvelope() throws Exception {
        when(deskVisitorService.updateStatus(any(JwtUser.class), anyString(), any(DeskStatusDTO.class)))
            .thenReturn(conversationResult());
        String token = bearer(783101L, 9L, UserRoleEnum.CONSOLE);

        mockMvc.perform(put("/api/desk/visitors/41/status").header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\": \"closed\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.OK.code))
            .andExpect(jsonPath("$.data.id").value("41"))
            .andExpect(jsonPath("$.data.identity.externalUserId").value("external-a"))
            .andExpect(jsonPath("$.data.status").value("waiting"))
            .andExpect(jsonPath("$.data.waitingSince").doesNotExist());
        ArgumentCaptor<DeskStatusDTO> captor = ArgumentCaptor.forClass(DeskStatusDTO.class);
        verify(deskVisitorService).updateStatus(any(JwtUser.class), eq("41"), captor.capture());
        assertThat(captor.getValue().status()).isEqualTo("closed");

        // 未认证与平台身份都不得进入服务
        mockMvc.perform(put("/api/desk/visitors/41/status")
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\": \"closed\"}"))
            .andExpect(jsonPath("$.code").value(ApiEnum.TOKEN_EMPTY.code));
        mockMvc.perform(put("/api/desk/visitors/41/status")
                .header("Authorization", bearer(null, 1L, UserRoleEnum.ADMIN))
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\": \"closed\"}"))
            .andExpect(jsonPath("$.code").value(ApiEnum.FORBIDDEN.code));
        verify(deskVisitorService, times(1))
            .updateStatus(any(JwtUser.class), anyString(), any(DeskStatusDTO.class));
    }

    @Test
    void deskVisitorQueryRejectsUnknownFilterValues() throws Exception {
        String token = bearer(783101L, 9L, UserRoleEnum.CONSOLE);
        mockMvc.perform(post("/api/desk/visitors/query").header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\": \"bogus\"}"))
            .andExpect(jsonPath("$.code").value(ApiEnum.PARAM_ERROR.code));
        mockMvc.perform(post("/api/desk/visitors/query").header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"order\": \"bogus\"}"))
            .andExpect(jsonPath("$.code").value(ApiEnum.PARAM_ERROR.code));
        verify(deskVisitorService, never()).query(any(JwtUser.class), any(DeskVisitorQueryDTO.class));
    }

    @Test
    void deskLoginValidatesCompanyIdAccountAndPassword() throws Exception {
        mockMvc.perform(post("/api/desk/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"companyId": "12345", "username": "boss", "password": "password123"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.PARAM_ERROR.code));
        mockMvc.perform(post("/api/desk/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"companyId": "783101", "username": "  ", "password": "password123"}
                    """))
            .andExpect(jsonPath("$.code").value(ApiEnum.PARAM_ERROR.code));
        mockMvc.perform(post("/api/desk/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"companyId": "783101", "username": "boss", "password": "%s"}
                    """.formatted("x".repeat(73))))
            .andExpect(jsonPath("$.code").value(ApiEnum.PARAM_ERROR.code));
        mockMvc.perform(post("/api/desk/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"companyId": "783101"}
                    """))
            .andExpect(jsonPath("$.code").value(ApiEnum.PARAM_ERROR.code));
        verify(deskAuthService, never()).login(any(DeskLoginDTO.class));
    }

    private String bearer(Long companyId, Long userId, UserRoleEnum role) {
        long exp = DateUtil.currentSeconds() + 3600;
        return "Bearer " + jwtManager.createToken(new JwtUser(companyId, userId, role, exp));
    }

    private DeskLoginVO loginResult() {
        return new DeskLoginVO("issued-token", 1800L,
            new DeskUserVO("9", "boss", "老板", UserRoleEnum.CONSOLE),
            new DeskCompanyVO("783101", "验收企业"),
            new DeskAccessVO(true,
                List.of(new DeskAccessVO.Group("31", "售前")),
                List.of(new DeskAccessVO.Account("51", "31", ChannelEnum.WECHAT, "公众号"))));
    }

    private DeskProfileVO profileResult() {
        return new DeskProfileVO(new DeskUserVO("9", "boss", "老板", UserRoleEnum.CONSOLE),
            new DeskCompanyVO("783101", "验收企业"),
            new DeskAccessVO(false, List.of(), List.of()));
    }

    private DeskVisitorPageVO pageResult() {
        return new DeskVisitorPageVO(List.of(conversationResult()), 1L, 2, 5,
            new DeskVisitorPageVO.Counts(4, 3, 1, 2),
            List.of(new DeskVisitorPageVO.Channel("wechat", "微信")));
    }

    private DeskMessagePageVO historyResult() {
        return new DeskMessagePageVO(List.of(
            new DeskMessageVO("41", "41", null, MessageDirectionEnum.INCOMING,
                java.util.Map.of("type", "text", "text", "还想问问保修"),
                LocalDateTime.of(2026, 10, 12, 9, 10, 0), 7, 1, null, null, null),
            new DeskMessageVO("42", "41", "client-1", MessageDirectionEnum.OUTGOING,
                java.util.Map.of("type", "text", "text", "好的，已登记"),
                LocalDateTime.of(2026, 10, 12, 9, 12, 0), 8, 1, "9", "老板",
                new DeskMessageVO.Delivery("sent", null))), "8");
    }

    private DeskConversationVO conversationResult() {
        return new DeskConversationVO("41",
            new DeskVisitorIdentityVO("41", "external-a", "林小满", null,
                "wechat", "微信", "51", "公众号"),
            VisitorStatusEnum.WAITING, "最后一条摘要",
            LocalDateTime.of(2026, 10, 12, 10, 30, 15), null, 7, 3,
            new DeskCapabilityVO("restricted", List.of(), "渠道发送能力尚未接入"));
    }
}
