package com.dudu.duduserver.dto;

import com.dudu.duduserver.common.PageQuery;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.util.ConsoleIdDeserializer;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;
import java.util.List;
import java.util.Map;

/**
 * 企业渠道账号请求白名单；fields 的值保留 JSON 类型，配置边界只接受字符串。
 */
public final class ConsoleChannelRequests {
    public static final int MAX_CONFIGURATION_BYTES = 128 * 1024;

    private ConsoleChannelRequests() {
    }

    @Data
    @EqualsAndHashCode(callSuper = true)
    @ToString(callSuper = true)
    public static class Query extends PageQuery implements ConsoleRequest {
        @Size(max = 100, message = "关键词长度不能超过 100 字符")
        private String keyword;
        @JsonDeserialize(using = ConsoleIdDeserializer.class)
        private String groupId;
        private ChannelEnum channel;
    }

    public record Create(@NotBlank @JsonDeserialize(using = ConsoleIdDeserializer.class) String groupId, @NotNull ChannelEnum channel,
                         @NotBlank String accountName,
                         @NotNull Map<String, Object> fields) implements ConsoleRequest {
    }

    public record Update(@NotBlank String accountName,
                         @Valid @NotNull Changes credentialChanges) implements ConsoleRequest {
    }

    public record Changes(@NotNull Map<String, Object> set, @NotNull List<@NotBlank String> clear) implements ConsoleRequest {
    }

    public record Move(@NotBlank @JsonDeserialize(using = ConsoleIdDeserializer.class) String groupId) implements ConsoleRequest {
    }
}
