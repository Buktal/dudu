package com.dudu.duduserver.channel.dingtalk;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.support.AccessTokenCache;
import com.dudu.duduserver.channel.support.AccessTokenCache.FetchedToken;
import com.dudu.duduserver.channel.support.TokenResult;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * 钉钉新版调用凭证客户端（事实库 §5.9/§6）：POST /v1.0/oauth2/accessToken 以
 * appKey/appSecret 换 accessToken，expireIn 7200s；按票面要求做进程内缓存复用
 * （AccessTokenCache 骨架，提前 200s 视为过期刷新——官方缓存约束：有效期内重复
 * 获取返回相同并续期，频调被拦截）。缓存键取 appKey。错误响应为新 api 系
 * code/message 形状，原始值透传不翻译。
 */
class DingtalkAccessTokenClient {

    // 提前刷新余量（毫秒）：官方建议提前约 10 分钟/200 秒，取短值 200s
    private static final long REFRESH_MARGIN_MILLIS = 200_000L;
    private static final String PATH_ACCESS_TOKEN = "/v1.0/oauth2/accessToken";

    private final RestClient restClient;
    private final AccessTokenCache<String> cache = new AccessTokenCache<>(REFRESH_MARGIN_MILLIS);

    DingtalkAccessTokenClient(RestClient restClient) {
        this.restClient = restClient;
    }

    // 取调用凭证：缓存命中直接复用，未命中单飞换取并写缓存（同键并发只发一次 HTTP）
    TokenResult fetch(DingtalkSendCredentials credentials) {
        return cache.getOrLoad(credentials.appKey(), () -> request(credentials));
    }

    // 请求渠道：appKey/appSecret 换 accessToken，失败带已成型的原因说明（不写缓存以便重试）
    private FetchedToken request(DingtalkSendCredentials credentials) {
        JSONObject response = JSONUtil.parseObj(restClient.post()
            .uri(PATH_ACCESS_TOKEN)
            .body(Map.of("appKey", credentials.appKey(), "appSecret", credentials.appSecret()))
            .retrieve()
            .body(String.class));
        String accessToken = response.getStr("accessToken");
        if (accessToken == null || accessToken.isEmpty()) {
            return FetchedToken.failed("钉钉凭证获取失败：" + DingtalkErrors.describeNew(response));
        }
        // expireIn 为秒；缺失时按官方默认 7200s 收敛
        long expireInMillis = response.getLong("expireIn", 7200L) * 1000;
        return FetchedToken.fetched(accessToken, expireInMillis);
    }
}
