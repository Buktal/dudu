package com.dudu.duduserver.config;

import com.fasterxml.jackson.datatype.jsr310.ser.LocalDateTimeSerializer;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.format.DateTimeFormatter;

/**
 * HTTP 响应时间格式：LocalDateTime 序列化为 uuuu-MM-dd HH:mm:ss（到秒，无时区标记）。
 * 全链路北京时间（ADR 0012），前端直接展示、不做时区换算。
 * 仅定制序列化方向；当前无请求侧 LocalDateTime 入参，反序列化沿用默认。
 */
@Configuration
public class JacksonConfig {

    // 固定格式：到秒，无时区标记
    private static final DateTimeFormatter DATETIME_FORMATTER =
        DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss");

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer beijingLocalDateTimeCustomizer() {
        return builder -> builder.serializers(new LocalDateTimeSerializer(DATETIME_FORMATTER));
    }
}
