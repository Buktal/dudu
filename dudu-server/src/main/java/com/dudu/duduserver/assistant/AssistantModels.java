package com.dudu.duduserver.assistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 坐席内部 AI 对话契约，不包含发送渠道消息的命令。
 */
public final class AssistantModels {
    private AssistantModels() { }

    public record Turn(@NotBlank @Pattern(regexp = "user|assistant") String role,
                       @NotBlank @Size(max = 4000) String content) { }
    public record Request(@NotBlank @Size(max = 2000) String prompt,
                          @NotBlank @Pattern(regexp = "chat|summary|reply") String task,
                          @Size(max = 4000) String draft,
                          @NotNull @Size(max = 12) List<@NotNull @Valid Turn> history) { }
    public record Availability(Boolean enabled, String serviceName) { }
    public record Result(String visitorId, String text, String serviceName, Long revision,
                         Integer contextMessageCount, Boolean contextTruncated) { }
}
