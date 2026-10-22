package com.dudu.duduserver.channel.feishu;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.support.AccessTokenCache;
import com.dudu.duduserver.channel.support.AccessTokenCache.FetchedToken;
import com.dudu.duduserver.channel.support.TokenResult;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/**
 * 飞书接口凭据换取（事实见 docs/research/channels/feishu.md §5.11、§6）：用
 * channel_info 的 appId/appSecret POST /open-apis/auth/v3/tenant_access_token/internal。
 * 官方要求缓存复用：token 最长 2 小时（expire 7200），剩余有效期不足 30 分钟时换新
 * （新旧并存）；进程内按 appId 缓存（AccessTokenCache 骨架，剩余不足 30 分钟视为
 * 过期），窗口取响应 expire，失败不缓存，渠道错误原样记录 code 与 msg。
 */
class FeishuTokenClient {

    private static final String PATH_TOKEN = "/open-apis/auth/v3/tenant_access_token/internal";
    private static final String KEY_APP_ID = "app_id";
    private static final String KEY_APP_SECRET = "app_secret";
    private static final String KEY_TOKEN = "tenant_access_token";
    private static final String KEY_EXPIRE = "expire";

    // 响应缺 expire 或非法时按官方最长寿命处理，不缩短复用窗口
    private static final long DEFAULT_EXPIRE_MILLIS = Duration.ofHours(2).toMillis();

    private final RestClient restClient;

    // 按 appId 缓存：同一应用在任何账号配置下指向同一飞书应用凭据
    private final AccessTokenCache<String> cache = new AccessTokenCache<>();

    FeishuTokenClient(RestClient restClient) {
        this.restClient = restClient;
    }

    TokenResult fetch(FeishuSendCredentials credentials) {
        // 缓存单飞：同键并发未命中只发一次 HTTP，失败不缓存以便重试，网络异常按失败返回
        return cache.getOrLoad(credentials.appId(), () -> request(credentials));
    }

    // 请求渠道：body 携带 app_id/app_secret（官方 §5.11），成功带 expire 决定缓存窗口
    private FetchedToken request(FeishuSendCredentials credentials) {
        try {
            JSONObject response = JSONUtil.parseObj(restClient.post()
                .uri(PATH_TOKEN)
                .body(JSONUtil.createObj()
                    .set(KEY_APP_ID, credentials.appId())
                    .set(KEY_APP_SECRET, credentials.appSecret()))
                .retrieve()
                .body(String.class));
            if (FeishuErrors.code(response) != 0) {
                return FetchedToken.failed("获取飞书接口凭据失败：" + FeishuErrors.describe(response));
            }
            String accessToken = response.getStr(KEY_TOKEN);
            if (accessToken == null || accessToken.isEmpty()) {
                return FetchedToken.failed("获取飞书接口凭据失败：响应缺少 tenant_access_token");
            }
            return FetchedToken.fetched(accessToken,
            AccessTokenCache.expiresInMillis(response, KEY_EXPIRE, DEFAULT_EXPIRE_MILLIS));
        } catch (RuntimeException e) {
            return FetchedToken.failed("获取飞书接口凭据失败：" + e.getMessage());
        }
    }

    // expire 为秒（官方样例 7200）；缺失或非法按默认窗口
}
