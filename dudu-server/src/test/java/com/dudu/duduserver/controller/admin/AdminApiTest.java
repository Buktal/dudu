package com.dudu.duduserver.controller.admin;

import cn.hutool.core.date.DateUtil;
import com.dudu.duduserver.config.auth.JwtManager;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.dto.CompanyCreateDTO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.testutil.NoDatasourceSpringTest;
import com.dudu.duduserver.util.PasswordHasher;
import com.dudu.duduserver.vo.AdminOverviewVO;
import com.dudu.duduserver.vo.CompanyIdAvailabilityVO;
import com.dudu.duduserver.vo.CompanyResourceSummaryVO;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Admin 模块 HTTP 契约验证：拦截器、认证签发、参数校验与异常映射走真实装配，
 * 领域服务以 Mockito 替身返回固定结果（service 分支由各领域单测覆盖，SQL 由本地 MySQL 验收覆盖）。
 */
@AutoConfigureMockMvc
class AdminApiTest extends NoDatasourceSpringTest {

    @Test
    void jsonQueriesRejectUnknownEnumsWithoutUrlConverters() throws Exception {
        mockMvc.perform(post("/api/admin/companies/query")
                .header("Authorization", bearer(UserRoleEnum.ADMIN))
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":2}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(11000));
        mockMvc.perform(post("/api/admin/operation_logs/query")
                .header("Authorization", bearer(UserRoleEnum.ADMIN))
                .contentType(MediaType.APPLICATION_JSON).content("{\"action\":\"unknown\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(11000));
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtManager jwtManager;

    private UserDO platformUser() {
        UserDO user = new UserDO();
        user.setUserId(1L);
        user.setUsername("Admin");
        user.setName("平台管理员");
        user.setPasswordHash(PasswordHasher.hash("Admin"));
        user.setRole(UserRoleEnum.ADMIN);
        user.setStatus(EnableStatusEnum.ENABLED);
        return user;
    }

    private String bearer(UserRoleEnum role) {
        long exp = DateUtil.currentSeconds() + 3600;
        return "Bearer " + jwtManager.createToken(new JwtUser(null, 1L, role, exp));
    }

    @Test
    void loginIssuesTokenForPlatformAdmin() throws Exception {
        when(userService.findPlatformUser("Admin")).thenReturn(platformUser());

        mockMvc.perform(post("/api/admin/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"username": "Admin", "password": "Admin"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.OK.code))
            .andExpect(jsonPath("$.data.token").isNotEmpty())
            .andExpect(jsonPath("$.data.user.userId").value("1"))
            .andExpect(jsonPath("$.data.user.username").value("Admin"))
            .andExpect(jsonPath("$.data.user.role").value(UserRoleEnum.ADMIN.getCode()));
    }

    @Test
    void loginFailsUniformlyForWrongPasswordAndUnknownAccount() throws Exception {
        when(userService.findPlatformUser("Admin")).thenReturn(platformUser());

        mockMvc.perform(post("/api/admin/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"username": "Admin", "password": "wrong-pass"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.LOGIN_FAILED.code));

        when(userService.findPlatformUser("nobody")).thenReturn(null);

        mockMvc.perform(post("/api/admin/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"username": "nobody", "password": "whatever"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.LOGIN_FAILED.code));
    }

    @Test
    void loginRejectsBlankRequestBody() throws Exception {
        mockMvc.perform(post("/api/admin/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"password": "whatever"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.PARAM_ERROR.code));
    }

    @Test
    void adminGuardRejectsNonPlatformRoleToken() throws Exception {
        mockMvc.perform(get("/api/admin/overview").header("Authorization", bearer(UserRoleEnum.USER)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.FORBIDDEN.code));
    }

    @Test
    void adminGuardRejectsMissingToken() throws Exception {
        mockMvc.perform(get("/api/admin/overview"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.TOKEN_EMPTY.code));
    }

    @Test
    void overviewReturnsAggregatedDataForPlatformAdmin() throws Exception {
        when(overviewService.getOverview()).thenReturn(
            new AdminOverviewVO(12L, 10L, 2L, 3L, List.of()));

        mockMvc.perform(get("/api/admin/overview").header("Authorization", bearer(UserRoleEnum.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.OK.code))
            .andExpect(jsonPath("$.data.companyCount").value(12))
            .andExpect(jsonPath("$.data.companyEnabledCount").value(10))
            .andExpect(jsonPath("$.data.companyDisabledCount").value(2))
            .andExpect(jsonPath("$.data.companyCreatedLast7DaysCount").value(3))
            .andExpect(jsonPath("$.data.recentCompanies").isArray());
    }

    @Test
    void createCompanyMapsServiceDataExistToContract() throws Exception {
        when(companyService.createCompany(any(CompanyCreateDTO.class), eq(1L)))
            .thenThrow(new BizException(ApiEnum.DATA_EXIST, "企业 ID 已被占用，请重新选择"));

        mockMvc.perform(post("/api/admin/companies")
                .header("Authorization", bearer(UserRoleEnum.ADMIN))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "companyId": "100001",
                      "companyName": "测试企业",
                      "adminInit": {"username": "boss", "password": "secret123"}
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.DATA_EXIST.code))
            .andExpect(jsonPath("$.msg").value("企业 ID 已被占用，请重新选择"));
    }

    @Test
    void createCompanyRejectsInvalidCompanyId() throws Exception {
        mockMvc.perform(post("/api/admin/companies")
                .header("Authorization", bearer(UserRoleEnum.ADMIN))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "companyId": "12345",
                      "companyName": "测试企业",
                      "adminInit": {"username": "boss", "password": "secret123"}
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.PARAM_ERROR.code));
    }

    @Test
    void idAvailabilityReportsOccupiedIdAsUnavailable() throws Exception {
        when(companyService.checkIdAvailability("888888"))
            .thenReturn(new CompanyIdAvailabilityVO("888888", false));

        mockMvc.perform(get("/api/admin/companies/id_availability")
                .param("companyId", "888888")
                .header("Authorization", bearer(UserRoleEnum.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.code").value(ApiEnum.OK.code))
            .andExpect(jsonPath("$.data.companyId").value("888888"))
            .andExpect(jsonPath("$.data.available").value(false));
    }

    @Test
    void resourceSummaryReturnsRealCountsForCompany() throws Exception {
        when(overviewService.getCompanyResourceSummary("888888"))
            .thenReturn(new CompanyResourceSummaryVO("888888", 6L, 5L, 2L, 3L));

        mockMvc.perform(get("/api/admin/companies/888888/resource_summary")
                .header("Authorization", bearer(UserRoleEnum.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.OK.code))
            .andExpect(jsonPath("$.data.companyId").value("888888"))
            .andExpect(jsonPath("$.data.userCount").value(6))
            .andExpect(jsonPath("$.data.userEnabledCount").value(5))
            .andExpect(jsonPath("$.data.userGroupCount").value(2))
            .andExpect(jsonPath("$.data.companyChannelCount").value(3));
    }

    @Test
    void updateStatusDisablesCompanyWithReason() throws Exception {
        mockMvc.perform(put("/api/admin/companies/888888/status")
                .header("Authorization", bearer(UserRoleEnum.ADMIN))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"status": 0, "disableReason": "长期不再使用"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.OK.code));

        verify(companyService).disable("888888", "长期不再使用", 1L);
    }

    @Test
    void updateStatusEnablesCompany() throws Exception {
        mockMvc.perform(put("/api/admin/companies/888888/status")
                .header("Authorization", bearer(UserRoleEnum.ADMIN))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"status": 1}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.OK.code));

        verify(companyService).enable("888888", 1L);
    }

    @Test
    void updateStatusRejectsUnknownStatusValue() throws Exception {
        mockMvc.perform(put("/api/admin/companies/888888/status")
                .header("Authorization", bearer(UserRoleEnum.ADMIN))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"status": 2, "disableReason": "任意"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.PARAM_ERROR.code));
    }

    @Test
    void unmatchedPathReturnsReal404WithoutREnvelope() throws Exception {
        mockMvc.perform(get("/no-such-path"))
            .andExpect(status().isNotFound())
            .andExpect(content().string(""));
    }

    @Test
    void methodMismatchReturnsReal405() throws Exception {
        mockMvc.perform(get("/api/desk/login"))
            .andExpect(status().isMethodNotAllowed());
    }

    @Test
    void unmatchedApiPathAuthenticatesBeforeRouting() throws Exception {
        mockMvc.perform(get("/api/no-such-path"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(ApiEnum.TOKEN_EMPTY.code));

        mockMvc.perform(get("/api/no-such-path").header("Authorization", bearer(UserRoleEnum.ADMIN)))
            .andExpect(status().isNotFound());
    }
}
