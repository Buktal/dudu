package com.dudu.duduserver.controller.desk;

import cn.hutool.core.date.DateUtil;
import com.dudu.duduserver.common.R;
import com.dudu.duduserver.config.auth.JwtManager;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.auth.Me;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.dto.DeskLoginDTO;
import com.dudu.duduserver.service.DeskAuthService;
import com.dudu.duduserver.testutil.NoDatasourceSpringTest;
import com.dudu.duduserver.vo.DeskAccessVO;
import com.dudu.duduserver.vo.DeskCompanyVO;
import com.dudu.duduserver.vo.DeskLoginVO;
import com.dudu.duduserver.vo.DeskProfileVO;
import com.dudu.duduserver.vo.DeskUserVO;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
}
