package com.dudu.duduserver.config.auth;

import cn.hutool.core.date.DateUtil;
import com.dudu.duduserver.config.response.R;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration",
        "dudu.auth.jwt-secret=test-secret"
})
@AutoConfigureMockMvc
@Import(AuthChainTest.PingController.class)
class AuthChainTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtManager jwtManager;

    @RestController
    static class PingController {
        @GetMapping({"/api/ping", "/identity"})
        R<JwtUser> ping(@Me JwtUser user) {
            return R.ok(user);
        }

        @GetMapping("/api/plain")
        R<Void> plain() {
            return R.ok();
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/ping", "/api/plain", "/identity"})
    void protectedEndpointRejectsMissingToken(String path) throws Exception {
        mockMvc.perform(get(path))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(10101));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/ping", "/api/plain", "/identity"})
    void protectedEndpointRejectsGarbageToken(String path) throws Exception {
        mockMvc.perform(get(path).header("Authorization", "Bearer not-a-jwt"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(10102));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/ping", "/identity"})
    void validTokenUnlocksEndpointAndResolverInjectsUser(String path) throws Exception {
        long exp = DateUtil.currentSeconds() + 3600;
        String token = jwtManager.createToken(new JwtUser(5L, "agent", exp));

        mockMvc.perform(get(path).header("Authorization", "Bearer " + token)
                        .param("userId", "999").param("role", "admin"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.userId").value(5))
                .andExpect(jsonPath("$.data.role").value("agent"))
                .andExpect(jsonPath("$.data.exp").value(exp));
    }

    @Test
    void validTokenUnlocksEndpointWithoutMe() throws Exception {
        String token = jwtManager.createToken(new JwtUser(5L, "agent", DateUtil.currentSeconds() + 3600));

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
