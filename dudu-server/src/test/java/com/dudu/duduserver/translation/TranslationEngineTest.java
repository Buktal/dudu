package com.dudu.duduserver.translation;

import com.dudu.duduserver.config.exception.BizException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import static com.dudu.duduserver.translation.TranslationModels.*;
import static org.assertj.core.api.Assertions.*;

/**
 * 以真实 HTTP 替身断言协议、完整响应、敏感信息隔离与网络地址守卫。
 */
class TranslationEngineTest {
    private final ObjectMapper json = new ObjectMapper();
    private final AtomicReference<String> response = new AtomicReference<>("{}");
    private final AtomicReference<String> body = new AtomicReference<>();
    private final AtomicReference<String> authorization = new AtomicReference<>();
    private HttpServer server;
    private TranslationEngine engine;
    private String endpoint;

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/translate", exchange -> {
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            byte[] bytes = response.get().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            try (var output = exchange.getResponseBody()) { output.write(bytes); }
        });
        server.start();
        endpoint = "http://127.0.0.1:" + server.getAddress().getPort() + "/translate";
        TranslationHttp http = new TranslationHttp(json, true);
        engine = new TranslationEngine(http, new TraditionalTranslation(http, json, new SignedTranslation(http, json)), json);
    }
    @AfterEach void stop() { server.stop(0); }

    @Test
    void compatibleModelPreservesTextAndDoesNotAcceptTruncatedOutput() throws Exception {
        Configuration config = config("custom-openai", Map.of("apiKey", "private-key", "model", "chosen-model"));
        response.set("{\"choices\":[{\"finish_reason\":\"stop\",\"message\":{\"content\":\"你好\\n谢谢\"}}]}");
        assertThat(engine.translate(config, "Hello\nThanks", "zh")).isEqualTo("你好\n谢谢");
        assertThat(authorization.get()).isEqualTo("Bearer private-key");
        var request = json.readTree(body.get());
        assertThat(request.path("model").asText()).isEqualTo("chosen-model");
        assertThat(request.path("messages").path(1).path("content").asText()).isEqualTo("Hello\nThanks");
        assertThat(request.path("stream").asBoolean()).isFalse();
        response.set("{\"choices\":[{\"finish_reason\":\"length\",\"message\":{\"content\":\"半句\"}}]}");
        assertThatThrownBy(() -> engine.translate(config, "Hello", "zh")).isInstanceOf(BizException.class);
        response.set("{\"error\":{\"message\":\"private-key\"}}");
        assertThatThrownBy(() -> engine.translate(config, "Hello", "zh")).hasMessageNotContaining("private-key");
    }

    @ParameterizedTest
    @CsvSource(value = {
        "baidu| {\"trans_result\":[{\"dst\":\"你好\"}]}",
        "deepl| {\"translations\":[{\"text\":\"你好\"}]}",
        "niutrans| {\"tgt_text\":\"你好\"}",
        "caiyun| {\"target\":[\"你好\"]}",
        "youdao| {\"errorCode\":\"0\",\"translation\":[\"你好\"]}",
        "google| {\"data\":{\"translations\":[{\"translatedText\":\"你好\"}]}}"
    }, delimiter = '|')
    void conventionalProtocolsReturnOnlyTranslation(String provider, String payload) {
        response.set(payload.replace('\'', '"').replace(';', ','));
        var descriptor = TranslationCatalog.require(provider);
        Map<String, String> values = descriptor.fields().stream().collect(java.util.stream.Collectors.toMap(Field::key, field -> "private-value"));
        assertThat(engine.translate(config(provider, values), "Hello", "zh")).isEqualTo("你好");
        assertThat(body.get()).contains("Hello");
    }

    @Test
    void claudeAndOllamaUseTheirOwnResponseContract() {
        response.set("{\"stop_reason\":\"end_turn\",\"content\":[{\"type\":\"text\",\"text\":\"你好\"}]}");
        assertThat(engine.translate(config("claude", Map.of("apiKey", "key", "model", "model")), "Hello", "zh")).isEqualTo("你好");
        response.set("{\"done\":true,\"message\":{\"content\":\"你好\"}}");
        assertThat(engine.translate(config("ollama", Map.of("model", "model")), "Hello", "zh")).isEqualTo("你好");
    }

    @Test
    void specializedProtocolsUseTheirOwnPayloadsAndResponses() throws Exception {
        response.set("[{\"translations\":[{\"text\":\"你好\"}]}]");
        assertThat(engine.translate(config("bing", Map.of("apiKey", "key", "region", "eastasia")), "Hello", "zh")).isEqualTo("你好");
        assertThat(json.readTree(body.get()).path(0).path("Text").asText()).isEqualTo("Hello");
        response.set("{\"Code\":200,\"Data\":{\"Translated\":\"你好\"}}");
        assertThat(engine.translate(config("alibaba", Map.of("accessKey", "access", "secret", "key")), "Hello", "zh")).isEqualTo("你好");
        assertThat(body.get()).contains("Action=TranslateGeneral", "Signature=", "SourceText=Hello");
        response.set("{\"TranslationList\":[{\"Translation\":\"你好\"}]}");
        assertThat(engine.translate(config("volcano", Map.of("accessKey", "access", "secret", "key", "region", "cn-north-1")), "Hello", "zh")).isEqualTo("你好");
        assertThat(authorization.get()).contains("HMAC-SHA256", "/cn-north-1/translate/request", "Signature=");
        response.set("{\"status\":\"completed\",\"output\":[{\"content\":[{\"type\":\"output_text\",\"text\":\"你好\"}]}]}");
        assertThat(engine.translate(config("doubao", Map.of("apiKey", "key", "model", "translation-model")), "Hello", "zh-TW")).isEqualTo("你好");
        assertThat(json.readTree(body.get()).path("input").path(0).path("content").path(0).path("translation_options").path("target_language").asText()).isEqualTo("zh-Hant");
    }

    @Test
    void localAddressesAndUnavailableProvidersAreRejected() {
        TranslationHttp restricted = new TranslationHttp(json, false);
        assertThatThrownBy(() -> restricted.validateEndpoint("https://127.0.0.1/translate")).isInstanceOf(BizException.class);
        assertThatThrownBy(() -> restricted.validateEndpoint("https://[::1]/translate")).isInstanceOf(BizException.class);
        assertThatThrownBy(() -> restricted.validateEndpoint("https://user:password@example.com/translate")).isInstanceOf(BizException.class);
        assertThatThrownBy(() -> engine.translate(config("tencent", Map.of()), "Hello", "zh")).isInstanceOf(BizException.class);
        assertThatThrownBy(() -> engine.translate(config("ollama", Map.of("model", "x")), "x".repeat(4001), "zh")).isInstanceOf(BizException.class);
    }

    @Test
    void encryptedSettingsAreBoundToCompanyAndDetectTampering() {
        TranslationCipher cipher = new TranslationCipher("translation-test-key-at-least-32-characters");
        String encrypted = cipher.encrypt(100001L, "private-key");
        assertThat(encrypted).doesNotContain("private-key");
        assertThat(cipher.decrypt(100001L, encrypted)).isEqualTo("private-key");
        assertThatThrownBy(() -> cipher.decrypt(100002L, encrypted)).isInstanceOf(BizException.class);
        assertThatThrownBy(() -> cipher.decrypt(100001L, "invalid")).isInstanceOf(BizException.class);
    }

    private Configuration config(String provider, Map<String, String> values) {
        return new Configuration("test-service", "Test", provider, endpoint, values);
    }
}
