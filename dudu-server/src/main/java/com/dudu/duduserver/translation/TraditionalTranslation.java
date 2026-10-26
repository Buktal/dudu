package com.dudu.duduserver.translation;

import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import static com.dudu.duduserver.translation.TranslationModels.*;

/**
 * 常规服务使用企业自有凭据，禁止借用参考项目内置访问或静默截断正文。
 */
@Component
@RequiredArgsConstructor
public class TraditionalTranslation {
    private final TranslationHttp http;
    private final ObjectMapper json;
    private final SignedTranslation signed;

    public String translate(Configuration config, String text, String target) {
        Map<String, String> v = config.values();
        String endpoint = config.endpoint();
        JsonNode result;
        switch (config.provider()) {
            case "baidu" -> {
                String salt = UUID.randomUUID().toString();
                result = form(endpoint, Map.of("q", text, "from", "auto", "to", baiduLanguage(target),
                    "appid", v.get("appId"), "salt", salt, "sign", digest("MD5", v.get("appId") + text + salt + v.get("secret"))));
                if (result.has("error_code")) throw TranslationEngine.invalidResponse();
                return TranslationEngine.joined(result.path("trans_result"), "dst");
            }
            case "deepl" -> {
                result = post(endpoint, Map.of("Authorization", "DeepL-Auth-Key " + v.get("apiKey")),
                    Map.of("text", List.of(text), "target_lang", target.equals("zh-TW") ? "ZH-HANT" : target.toUpperCase(java.util.Locale.ROOT)));
                return TranslationEngine.joined(result.path("translations"), "text");
            }
            case "google" -> {
                // Key 放请求头，不写入 URL 与访问日志。
                result = post(endpoint, Map.of("X-Goog-Api-Key", v.get("apiKey")), Map.of("q", List.of(text), "target", target, "format", "text"));
                return TranslationEngine.joined(result.path("data").path("translations"), "translatedText");
            }
            case "bing" -> {
                endpoint += (endpoint.contains("?") ? "&" : "?") + "to=" + encode(target.equals("zh") ? "zh-Hans" : target.equals("zh-TW") ? "zh-Hant" : target);
                result = post(endpoint, Map.of("Ocp-Apim-Subscription-Key", v.get("apiKey"), "Ocp-Apim-Subscription-Region", v.get("region")), List.of(Map.of("Text", text)));
                return TranslationEngine.joined(result.path(0).path("translations"), "text");
            }
            case "caiyun" -> {
                String language = target.equals("zh-TW") ? "zh" : target;
                if (!List.of("zh", "en", "ja").contains(language) || target.equals("zh-TW")) {
                    throw new BizException(ApiEnum.PARAM_ERROR, "彩云当前适配仅支持简体中文、英语、日语");
                }
                result = post(endpoint, Map.of("x-authorization", "token " + v.get("apiKey")),
                    Map.of("source", List.of(text), "trans_type", "auto2" + language, "request_id", UUID.randomUUID().toString(), "detect", true));
                return textArray(result.path("target"));
            }
            case "niutrans" -> {
                result = form(endpoint, Map.of("src_text", text, "from", "auto", "to", target.equals("zh-TW") ? "cht" : target, "apikey", v.get("apiKey")));
                if (result.has("error_code")) throw TranslationEngine.invalidResponse();
                return result.path("tgt_text").asText();
            }
            case "youdao" -> {
                String salt = UUID.randomUUID().toString();
                String now = String.valueOf(Instant.now().getEpochSecond());
                int[] codepoints = text.codePoints().toArray();
                String input = codepoints.length <= 20 ? text : new String(codepoints, 0, 10) + codepoints.length
                    + new String(codepoints, codepoints.length - 10, 10);
                result = form(endpoint, Map.of("q", text, "from", "auto", "to", target.equals("zh") ? "zh-CHS" : target.equals("zh-TW") ? "zh-CHT" : target,
                    "appKey", v.get("appId"), "salt", salt, "curtime", now, "signType", "v3",
                    "sign", digest("SHA-256", v.get("appId") + input + salt + now + v.get("secret"))));
                if (!"0".equals(result.path("errorCode").asText())) throw TranslationEngine.invalidResponse();
                return textArray(result.path("translation"));
            }
            case "alibaba", "volcano" -> { return signed.translate(config, text, target); }
            default -> throw new BizException(ApiEnum.DATA_NOT_ALLOW, "此服务暂无可用适配");
        }
    }

    private String baiduLanguage(String target) {
        return Map.of("zh-TW", "cht", "ja", "jp", "ko", "kor", "fr", "fra", "es", "spa", "ar", "ara", "vi", "vie").getOrDefault(target, target);
    }

    private String textArray(JsonNode array) {
        if (!array.isArray()) return "";
        StringBuilder text = new StringBuilder();
        for (JsonNode item : array) {
            if (!item.isTextual()) throw TranslationEngine.invalidResponse();
            if (!text.isEmpty()) text.append('\n');
            text.append(item.asText());
        }
        return text.toString();
    }

    private JsonNode form(String endpoint, Map<String, String> body) {
        return http.post(endpoint, Map.of(), encodeForm(body), true);
    }

    private JsonNode post(String endpoint, Map<String, String> headers, Object body) {
        try { return http.post(endpoint, headers, json.writeValueAsString(body), false); }
        catch (com.fasterxml.jackson.core.JsonProcessingException error) { throw TranslationEngine.invalidResponse(); }
    }

    static String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20").replace("%7E", "~").replace("*", "%2A"); }
    static String encodeForm(Map<String, String> body) {
        return body.entrySet().stream().sorted(Map.Entry.comparingByKey())
            .map(entry -> encode(entry.getKey()) + "=" + encode(entry.getValue())).collect(Collectors.joining("&"));
    }
    static String digest(String algorithm, String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance(algorithm).digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }
}
