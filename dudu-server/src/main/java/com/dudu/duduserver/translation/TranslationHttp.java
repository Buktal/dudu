package com.dudu.duduserver.translation;

import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.Semaphore;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.nio.ByteBuffer;
import java.util.List;
import java.io.ByteArrayOutputStream;

/**
 * 模型与翻译共用的有限 HTTP 边界，不跟随重定向、不透传上游响应或密钥。
 */
@Component
public class TranslationHttp {
    private static final int MAX_RESPONSE_BYTES = 1024 * 1024;
    private static final int MAX_GLOBAL_REQUESTS = 16;
    private static final int REQUEST_TIMEOUT_SECONDS = 20;
    private final ObjectMapper json;
    private final boolean allowPrivate;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NEVER).build();
    private final Semaphore slots = new Semaphore(MAX_GLOBAL_REQUESTS);

    public TranslationHttp(ObjectMapper json, @Value("${dudu.translation.allow-private-endpoints:false}") boolean allowPrivate) {
        this.json = json;
        this.allowPrivate = allowPrivate;
    }

    public void validateEndpoint(String endpoint) {
        try {
            URI uri = URI.create(endpoint);
            if (uri.getHost() == null || uri.getUserInfo() != null || uri.getFragment() != null
                || !("https".equals(uri.getScheme()) || allowPrivate && "http".equals(uri.getScheme()))) {
                throw new BizException(ApiEnum.PARAM_ERROR, "服务地址须为无账户信息的 HTTPS URL");
            }
            for (InetAddress address : InetAddress.getAllByName(uri.getHost())) {
                byte[] bytes = address.getAddress();
                if (!allowPrivate && (address.isAnyLocalAddress() || address.isLoopbackAddress()
                    || address.isLinkLocalAddress() || address.isSiteLocalAddress() || address.isMulticastAddress()
                    || bytes.length == 16 && (bytes[0] & 0xfe) == 0xfc
                    || bytes.length == 4 && (bytes[0] & 255) == 100 && (bytes[1] & 255) >= 64 && (bytes[1] & 255) <= 127)) {
                    throw new BizException(ApiEnum.PARAM_ERROR, "服务地址不允许访问本地或私有网络");
                }
            }
        } catch (IllegalArgumentException | java.net.UnknownHostException error) {
            throw new BizException(ApiEnum.PARAM_ERROR, "服务接口地址无效或无法解析");
        }
    }

    public JsonNode post(String endpoint, Map<String, String> headers, String body, boolean form) {
        validateEndpoint(endpoint);
        if (!slots.tryAcquire()) throw new BizException(ApiEnum.DATA_NOT_ALLOW, "服务请求较多，请稍后重试");
        try {
            HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(endpoint)).timeout(Duration.ofSeconds(REQUEST_TIMEOUT_SECONDS))
                .header("Content-Type", form ? "application/x-www-form-urlencoded" : "application/json")
                .header("Accept", "application/json").POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
            headers.forEach(request::header);
            var future = client.sendAsync(request.build(), ignored -> new LimitedBody());
            HttpResponse<byte[]> response;
            try { response = future.get(REQUEST_TIMEOUT_SECONDS, TimeUnit.SECONDS); }
            catch (java.util.concurrent.TimeoutException error) {
                future.cancel(true);
                throw new BizException(ApiEnum.REQUEST_THIRD_ERROR, "外部服务响应超时");
            } catch (InterruptedException error) {
                future.cancel(true);
                throw error;
            }
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new BizException(ApiEnum.REQUEST_THIRD_ERROR, "外部服务请求失败，请检查凭据、额度与接口地址");
            }
            JsonNode parsed = json.readTree(response.body());
            if (parsed == null || !parsed.isContainerNode()) throw TranslationEngine.invalidResponse();
            return parsed;
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new BizException(ApiEnum.REQUEST_THIRD_ERROR, "外部服务请求已中断");
        } catch (java.io.IOException | java.util.concurrent.ExecutionException error) {
            throw new BizException(ApiEnum.REQUEST_THIRD_ERROR, "外部服务超时或响应无效");
        } catch (IllegalArgumentException error) {
            throw new BizException(ApiEnum.PARAM_ERROR, "服务配置包含无效的请求参数");
        } finally {
            slots.release();
        }
    }

    // 流式限长后聚合，避免先完整下载再检查大小；不把响应体写入异常或日志。
    private static final class LimitedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final CompletableFuture<byte[]> body = new CompletableFuture<>();
        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private Flow.Subscription subscription;
        @Override public CompletionStage<byte[]> getBody() { return body; }
        @Override public void onSubscribe(Flow.Subscription incoming) { subscription = incoming; incoming.request(Long.MAX_VALUE); }
        @Override public void onNext(List<ByteBuffer> buffers) {
            for (ByteBuffer buffer : buffers) {
                if (bytes.size() + buffer.remaining() > MAX_RESPONSE_BYTES) {
                    subscription.cancel();
                    body.completeExceptionally(new java.io.IOException("翻译响应过大"));
                    return;
                }
                byte[] chunk = new byte[buffer.remaining()];
                buffer.get(chunk);
                bytes.writeBytes(chunk);
            }
        }
        @Override public void onError(Throwable error) { body.completeExceptionally(error); }
        @Override public void onComplete() { body.complete(bytes.toByteArray()); }
    }
}
