package com.dudu.duduserver.config.auth;

import cn.hutool.core.date.DateUtil;
import com.dudu.duduserver.common.R;
import com.dudu.duduserver.testutil.NoDatasourceSpringTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
@Import(AuthChainTest.PingController.class)
class AuthChainTest extends NoDatasourceSpringTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtManager jwtManager;

    @RestController
    static class PingController {
        @GetMapping({"/api/ping", "/identity", "/api/console/ping"})
        R<JwtUser> ping(@Me JwtUser user) {
            return R.ok(user);
        }

        @GetMapping("/api/plain")
        R<Void> plain() {
            return R.ok();
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/ping", "/api/plain", "/identity", "/api/console/ping"})
    void protectedEndpointRejectsMissingToken(String path) throws Exception {
        mockMvc.perform(get(path))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(10101));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/ping", "/api/plain", "/identity", "/api/console/ping"})
    void protectedEndpointRejectsGarbageToken(String path) throws Exception {
        mockMvc.perform(get(path).header("Authorization", "Bearer not-a-jwt"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(10102));
    }

    @Test
    void consoleEndpointRejectsNonConsoleRoleBeforeServiceLayer() throws Exception {
        String token = jwtManager.createToken(new JwtUser(7L, 5L, com.dudu.duduserver.constant.UserRoleEnum.USER,
            DateUtil.currentSeconds() + 3600));

        // Console 拦截器只做角色粗判：非 console 角色的 token 不触达服务层即被拒
        mockMvc.perform(get("/api/console/ping").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(10106));
    }

    @Test
    void consoleEndpointLetsConsoleRoleThroughForServiceLayerChecks() throws Exception {
        long exp = DateUtil.currentSeconds() + 3600;
        String token = jwtManager.createToken(new JwtUser(7L, 5L, com.dudu.duduserver.constant.UserRoleEnum.CONSOLE, exp));

        // 合法 console token 被拦截器放行；企业身份与管理范围由服务层 require/lock 全量解析
        mockMvc.perform(get("/api/console/ping").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
            .andExpect(jsonPath("$.code").value(0))
            .andExpect(jsonPath("$.data.companyId").value(7))
            .andExpect(jsonPath("$.data.role").value("console"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/ping", "/identity"})
    void validTokenUnlocksEndpointAndResolverInjectsUser(String path) throws Exception {
        long exp = DateUtil.currentSeconds() + 3600;
        String token = jwtManager.createToken(new JwtUser(null, 5L, com.dudu.duduserver.constant.UserRoleEnum.USER, exp));

        mockMvc.perform(get(path).header("Authorization", "Bearer " + token)
                .param("userId", "999").param("role", "admin"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0))
            .andExpect(jsonPath("$.data.userId").value(5))
            .andExpect(jsonPath("$.data.role").value("user"))
            .andExpect(jsonPath("$.data.exp").value(exp));
    }

    @Test
    void validTokenUnlocksEndpointWithoutMe() throws Exception {
        String token = jwtManager.createToken(new JwtUser(null, 5L, com.dudu.duduserver.constant.UserRoleEnum.USER, DateUtil.currentSeconds() + 3600));

        mockMvc.perform(get("/api/plain").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0));
    }

    @Test
    void malformedHeaderMapsToAuthenticationFailure() throws Exception {
        mockMvc.perform(get("/api/ping").header("Authorization", "Bearer YmFkLWpzb24.e30.x"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(10102));
    }
}
