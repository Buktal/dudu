package com.dudu.duduserver.config.auth;

import com.dudu.duduserver.common.JwtUser;
import com.dudu.duduserver.common.R;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration",
        "dudu.auth.jwt-secret=test-secret",
        "dudu.auth.dev-token-enabled=true"
})
@AutoConfigureMockMvc
@Import(AuthChainTest.PingController.class)
class AuthChainTest {

    @Autowired
    private MockMvc mockMvc;

    @RestController
    static class PingController {
        @GetMapping("/api/ping")
        R<JwtUser> ping(@CurrentUser JwtUser user) {
            return R.ok(user);
        }
    }

    private String fetchToken() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/dev/token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userId\":5,\"role\":\"agent\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andReturn();
        return com.fasterxml.jackson.databind.json.JsonMapper.builder()
                .build()
                .readTree(result.getResponse().getContentAsString())
                .path("data")
                .asText();
    }

    @Test
    void whitelistLetsDevTokenEndpointPassWithoutToken() throws Exception {
        mockMvc.perform(post("/api/dev/token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userId\":5,\"role\":\"agent\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data").isNotEmpty());
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
        String token = fetchToken();
        assertThat(token).isNotBlank();

        mockMvc.perform(get("/api/ping").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.userId").value(5))
                .andExpect(jsonPath("$.data.role").value("agent"));
    }

    @Test
    void devTokenFormValidationFails() throws Exception {
        mockMvc.perform(post("/api/dev/token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userId\":null,\"role\":\"\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(11000));
    }
}
