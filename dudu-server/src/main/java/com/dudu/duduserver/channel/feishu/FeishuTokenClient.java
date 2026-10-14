package com.dudu.duduserver.channel.feishu;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 飞书接口凭据换取（事实见 docs/research/channels/feishu.md §5.11、§6）：用
 * channel_info 的 appId/appSecret POST /open-apis/auth/v3/tenant_access_token/internal。
 * 官方要求缓存复用：token 最长 2 小时（expire 7200），剩余有效期不足 30 分钟时换新
 * （新旧并存）；进程内按 appId 缓存，窗口取响应 expire，失败不缓存，
 * 渠道错误原样记录 code 与 msg。
 */
class FeishuTokenClient {

    private static final String PATH_TOKEN = "/open-apis/auth/v3/tenant_access_token/internal";
    private static final String KEY_APP_ID = "app_id";
    private static final String KEY_APP_SECRET = "app_secret";
    private static final String KEY_TOKEN = "tenant_access_token";
    private static final String KEY_EXPIRE = "expire";

    // 剩余有效期不足 30 分钟即换新（官方 §6；与渠道新旧并存语义兼容）
    private static final long REFRESH_AHEAD_MILLIS = Duration.ofMinutes(30).toMillis();

    // 响应缺 expire 或非法时按官方最长寿命处理，不缩短复用窗口
    private static final long DEFAULT_EXPIRE_MILLIS = Duration.ofHours(2).toMillis();

    private final RestClient restClient;

    // 按 appId 缓存：同一应用在任何账号配置下指向同一飞书应用凭据
    private final Map<String, CachedToken> cache = new ConcurrentHashMap<>();

    FeishuTokenClient(RestClient restClient) {
        this.restClient = restClient;
    }

    // 换取结果：成功只带 tenant_access_token，失败只带已成型的原因说明
    record TokenResult(String accessToken, String failureReason) {

        boolean succeeded() {
            return accessToken != null;
        }
    }

    private record CachedToken(String token, long expiresAtMillis) {
    }

    TokenResult fetch(FeishuSendCredentials credentials) {
        long now = System.currentTimeMillis();
        CachedToken cached = cache.get(credentials.appId());
        if (cached != null && cached.expiresAtMillis() - now > REFRESH_AHEAD_MILLIS) {
            return new TokenResult(cached.token(), null);
        }
        // 请求成功由 request 写缓存（窗口取响应 expire），失败不缓存以便下次重试
        return request(credentials, now);
    }

    // 请求渠道：body 携带 app_id/app_secret（官方 §5.11），成功带 expire 决定缓存窗口
    private TokenResult request(FeishuSendCredentials credentials, long now) {
        try {
            JSONObject response = JSONUtil.parseObj(restClient.post()
                .uri(PATH_TOKEN)
                .body(JSONUtil.createObj()
                    .set(KEY_APP_ID, credentials.appId())
                    .set(KEY_APP_SECRET, credentials.appSecret()))
                .retrieve()
                .body(String.class));
            if (FeishuErrors.code(response) != 0) {
                return new TokenResult(null, "获取飞书接口凭据失败：" + FeishuErrors.describe(response));
            }
            String accessToken = response.getStr(KEY_TOKEN);
            if (accessToken == null || accessToken.isEmpty()) {
                return new TokenResult(null, "获取飞书接口凭据失败：响应缺少 tenant_access_token");
            }
            cache.put(credentials.appId(), new CachedToken(accessToken, now + expireMillis(response)));
            return new TokenResult(accessToken, null);
        } catch (RuntimeException e) {
            return new TokenResult(null, "获取飞书接口凭据失败：" + e.getMessage());
        }
    }

    // expire 为秒（官方样例 7200）；缺失或非法按默认窗口
    private long expireMillis(JSONObject response) {
        Long expire = response.getLong(KEY_EXPIRE, null);
        return expire == null || expire <= 0 ? DEFAULT_EXPIRE_MILLIS : expire * 1000;
    }
}
