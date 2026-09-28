package com.dudu.duduserver.config.auth;

import com.dudu.duduserver.common.JwtUser;
import com.dudu.duduserver.common.R;
import org.junit.jupiter.api.Test;
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
        "dudu.auth.jwt-secret=test-secret",
        "dudu.auth.whitelist[0]=/api/ping/open"
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
        @GetMapping("/api/ping")
        R<JwtUser> ping(@Me JwtUser user) {
            return R.ok(user);
        }

        @GetMapping("/api/ping/open")
        R<String> open() {
            return R.ok("pong");
        }
    }

    @Test
    void whitelistPathPassesWithoutToken() throws Exception {
        mockMvc.perform(get("/api/ping/open"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0));
    }

    @Test
    void protectedEndpointRejectsMissingToken() throws Exception {
        mockMvc.perform(get("/api/ping"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(10101));
    }

    @Test
    void protectedEndpointRejectsGarbageToken() throws Exception {
        mockMvc.perform(get("/api/ping").header("Authorization", "Bearer not-a-jwt"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(10102));
    }

    @Test
    void validTokenUnlocksEndpointAndResolverInjectsUser() throws Exception {
        String token = jwtManager.createToken(new JwtUser(5L, "agent"));

        mockMvc.perform(get("/api/ping").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.userId").value(5))
                .andExpect(jsonPath("$.data.role").value("agent"));
    }
}
