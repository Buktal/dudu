package com.dudu.duduserver.translation;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import java.util.Map;

/**
 * 翻译配置与执行契约，密钥只通过写请求进入服务端。
 */
public final class TranslationModels {
    private TranslationModels() { }

    public record Field(String key, String label, Boolean secret, Boolean required) { }
    public record Provider(String id, String name, String kind, String endpoint,
                           List<Field> fields, String unavailableReason) { }
    // 独立记录避免 record 自动生成的 toString 暴露密钥。
    public record Configuration(@NotBlank @Pattern(regexp = "[a-zA-Z0-9_-]{1,64}") String id,
                                @NotBlank @Size(max = 80) String name, @NotBlank String provider,
                                @Size(max = 2048) String endpoint,
                                @NotNull @Size(max = 20) Map<@NotBlank @Size(max = 64) String, @NotNull @Size(max = 8192) String> values) {
        @Override public String toString() { return "TranslationConfiguration[redacted]"; }
    }
    public record Save(@NotNull Long revision, @Size(max = 64) String defaultService,
                       @NotNull @Size(max = 40) List<@NotNull @Valid Configuration> services) { }
    public record View(Long revision, String defaultService, List<Configuration> services,
                       List<Provider> providers) { }
    public record Preference(@NotNull Boolean automatic,
                             @NotBlank @Pattern(regexp = "[a-z]{2,3}(-[A-Za-z]{2,8})?") String targetLanguage) { }
    public record Request(@NotNull @Positive Long version,
                          @NotBlank @Pattern(regexp = "[a-z]{2,3}(-[A-Za-z]{2,8})?") String targetLanguage) { }
    public record Result(String text, String targetLanguage, String serviceName, Long revision) { }
    public record Test(@NotNull @Valid Configuration configuration,
                       @NotBlank @Pattern(regexp = "[a-z]{2,3}(-[A-Za-z]{2,8})?") String targetLanguage) { }
}
