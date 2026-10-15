package com.dudu.duduserver.channel.wecom;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.support.AccessTokenCache;
import com.dudu.duduserver.channel.support.AccessTokenCache.FetchedToken;
import com.dudu.duduserver.channel.support.Errcodes;
import com.dudu.duduserver.channel.support.TokenResult;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/**
 * 企业微信 access_token 换取（事实见 docs/research/channels/wecom.md §6/91039）：用
 * channel_info 的 corpId/corpSecret 请求 GET /cgi-bin/gettoken。官方要求缓存复用
 * （access_token 有效期 7200 秒、每应用独立，频繁调用会被频率拦截，可能被运营提前
 * 作废）：进程内按凭据组缓存复用、剩余不足 30 分钟即换新（口径与飞书/抖音一致），
 * 失败不缓存以便重试；渠道错误原样记录 errcode 与 errmsg。
 */
class WecomAccessTokenClient {

    private static final String PATH_GETTOKEN = "/cgi-bin/gettoken";
    private static final String KEY_ACCESS_TOKEN = "access_token";
    private static final String KEY_EXPIRES_IN = "expires_in";

    // 官方有效期 7200 秒；响应缺 expires_in 或非法时按此收敛缓存窗口
    private static final long DEFAULT_EXPIRE_MILLIS = Duration.ofHours(2).toMillis();

    private final RestClient restClient;

    // 按凭据组缓存：corpId+corpSecret（+agentId）的值等即键，换密后旧缓存自然失效
    private final AccessTokenCache<WecomCredentials> cache = new AccessTokenCache<>();

    WecomAccessTokenClient(RestClient restClient) {
        this.restClient = restClient;
    }

    TokenResult fetch(WecomCredentials credentials) {
        // 缓存单飞：同键并发未命中只发一次 HTTP（频调会被频率拦截），失败不缓存以便重试
        return cache.getOrLoad(credentials, () -> request(credentials));
    }

    // 请求渠道：成功带 expires_in 决定缓存窗口，失败带已成型的原因说明（不写缓存以便重试）
    private FetchedToken request(WecomCredentials credentials) {
        JSONObject response = JSONUtil.parseObj(restClient.get()
            .uri(PATH_GETTOKEN + "?corpid={corpid}&corpsecret={corpsecret}",
                credentials.corpId(), credentials.corpSecret())
            .retrieve()
            .body(String.class));
        if (Errcodes.code(response) != 0) {
            return FetchedToken.failed("获取企业微信接口凭据失败：" + Errcodes.describe(response));
        }
        String accessToken = response.getStr(KEY_ACCESS_TOKEN);
        if (accessToken == null || accessToken.isEmpty()) {
            return FetchedToken.failed("获取企业微信接口凭据失败：响应缺少 access_token");
        }
        return FetchedToken.fetched(accessToken, lifetimeMillis(response));
    }

    // expires_in 为秒（官方样例 7200）；缺失或非法按官方有效期
    private long lifetimeMillis(JSONObject response) {
        Long expiresIn = response.getLong(KEY_EXPIRES_IN, null);
        return expiresIn == null || expiresIn <= 0 ? DEFAULT_EXPIRE_MILLIS : expiresIn * 1000;
    }
}
