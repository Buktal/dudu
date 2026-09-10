package com.dudu.duduserver.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration",
        "dudu.auth.jwt-secret=test-secret",
        "dudu.auth.dev-token-enabled=false"
})
@AutoConfigureMockMvc
class DevTokenDisabledTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void disabledSwitchTurnsEndpointAway() throws Exception {
        mockMvc.perform(post("/api/dev/token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userId\":5,\"role\":\"agent\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(13200))
                .andExpect(jsonPath("$.msg").value("dev token 端点未开启"));
    }
}
