package com.dudu.duduserver.translation;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import static com.dudu.duduserver.translation.TraditionalTranslation.*;
import static com.dudu.duduserver.translation.TranslationModels.*;

/**
 * 阿里 RPC 与火山签名协议，各自按最终请求字节计算签名。
 */
@Component
@RequiredArgsConstructor
public class SignedTranslation {
    private final TranslationHttp http;
    private final ObjectMapper json;

    public String translate(Configuration config, String text, String target) {
        return "alibaba".equals(config.provider()) ? alibaba(config, text, target) : volcano(config, text, target);
    }

    private String alibaba(Configuration config, String text, String target) {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("FormatType", "text");
        params.put("SourceLanguage", "auto");
        params.put("TargetLanguage", target.equals("zh-TW") ? "zh-tw" : target);
        params.put("SourceText", text);
        params.put("Scene", "general");
        params.put("Action", "TranslateGeneral");
        params.put("Version", "2018-10-12");
        params.put("Format", "JSON");
        params.put("AccessKeyId", config.values().get("accessKey"));
        params.put("SignatureNonce", UUID.randomUUID().toString());
        params.put("Timestamp", DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm:ss'Z'").withZone(ZoneOffset.UTC).format(Instant.now()));
        params.put("SignatureMethod", "HMAC-SHA1");
        params.put("SignatureVersion", "1.0");
        params.put("Signature", Base64.getEncoder().encodeToString(hmac("HmacSHA1",
            (config.values().get("secret") + "&").getBytes(StandardCharsets.UTF_8), "POST&%2F&" + encode(encodeForm(params)))));
        var result = http.post(config.endpoint(), Map.of(), encodeForm(params), true);
        if (!"200".equals(result.path("Code").asText())) throw TranslationEngine.invalidResponse();
        return result.path("Data").path("Translated").asText();
    }

    private String volcano(Configuration config, String text, String target) {
        try {
            String body = json.writeValueAsString(Map.of("SourceLanguage", "auto", "TargetLanguage", target.equals("zh-TW") ? "zh-Hant" : target, "TextList", List.of(text)));
            URI uri = URI.create(config.endpoint());
            String date = DateTimeFormatter.ofPattern("uuuuMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC).format(Instant.now());
            String shortDate = date.substring(0, 8);
            String region = config.values().get("region");
            String headers = "content-type:application/json\nhost:" + uri.getAuthority() + "\nx-date:" + date + "\n";
            String signedHeaders = "content-type;host;x-date";
            String canonical = "POST\n" + (uri.getRawPath().isEmpty() ? "/" : uri.getRawPath()) + "\n" + uri.getRawQuery()
                + "\n" + headers + "\n" + signedHeaders + "\n" + digest("SHA-256", body);
            String scope = shortDate + "/" + region + "/translate/request";
            byte[] key = config.values().get("secret").getBytes(StandardCharsets.UTF_8);
            for (String part : List.of(shortDate, region, "translate", "request")) key = hmac("HmacSHA256", key, part);
            String signature = HexFormat.of().formatHex(hmac("HmacSHA256", key, "HMAC-SHA256\n" + date + "\n" + scope + "\n" + digest("SHA-256", canonical)));
            var result = http.post(config.endpoint(), Map.of("X-Date", date, "Authorization", "HMAC-SHA256 Credential="
                + config.values().get("accessKey") + "/" + scope + ", SignedHeaders=" + signedHeaders + ", Signature=" + signature), body, false);
            if (result.path("ResponseMetadata").has("Error")) throw TranslationEngine.invalidResponse();
            return TranslationEngine.joined(result.path("TranslationList"), "Translation");
        } catch (com.fasterxml.jackson.core.JsonProcessingException error) { throw TranslationEngine.invalidResponse(); }
    }

    private static byte[] hmac(String algorithm, byte[] key, String message) {
        try {
            Mac mac = Mac.getInstance(algorithm);
            mac.init(new SecretKeySpec(key, algorithm));
            return mac.doFinal(message.getBytes(StandardCharsets.UTF_8));
        } catch (java.security.GeneralSecurityException error) { throw new IllegalStateException(error); }
    }
}
