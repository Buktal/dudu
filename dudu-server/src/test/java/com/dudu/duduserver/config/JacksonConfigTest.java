package com.dudu.duduserver.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class JacksonConfigTest {

    @Test
    void localDateTimeSerializesAsBeijingDateTimeToSeconds() throws Exception {
        Jackson2ObjectMapperBuilder builder = Jackson2ObjectMapperBuilder.json();
        new JacksonConfig().beijingLocalDateTimeCustomizer().customize(builder);
        ObjectMapper mapper = builder.build();

        String json = mapper.writeValueAsString(LocalDateTime.of(2026, 9, 30, 8, 30, 5, 123_000_000));

        assertThat(json).isEqualTo("\"2026-09-30 08:30:05\"");
    }
}
