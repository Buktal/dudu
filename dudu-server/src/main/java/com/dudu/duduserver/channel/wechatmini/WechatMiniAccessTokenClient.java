package com.dudu.duduserver.channel.wechatmini;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.support.AccessTokenCache;
import com.dudu.duduserver.channel.support.Errcodes;
import com.dudu.duduserver.channel.support.TokenResult;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/**
 * 小程序 access_token 换取（事实见 docs/research/channels/wechat-mini.md §6.1）：用
 * channel_info 的 appId/appSecret 请求 /cgi-bin/token。官方要求服务端妥善缓存
 * （expires_in 7200）：进程内按凭据组缓存复用、剩余不足 30 分钟即换新（口径与飞书/
 * 抖音一致），失败不缓存以便重试；复用同一换取逻辑与同一份失败说明格式，渠道错误
 * 原样记录 errcode 与 errmsg。
 */
class WechatMiniAccessTokenClient {

    private static final String PATH_TOKEN = "/cgi-bin/token";
    private static final String GRANT_TYPE_CLIENT_CREDENTIAL = "client_credential";
    private static final String KEY_ACCESS_TOKEN = "access_token";
    private static final String KEY_EXPIRES_IN = "expires_in";

    // 官方有效期 7200 秒；响应缺 expires_in 或非法时按此收敛缓存窗口
    private static final long DEFAULT_EXPIRE_MILLIS = Duration.ofHours(2).toMillis();

    private final RestClient restClient;

    // 按凭据组缓存：appId+appSecret 的值等即键，换密后旧缓存自然失效
    private final AccessTokenCache<WechatMiniCredentials> cache = new AccessTokenCache<>();

    WechatMiniAccessTokenClient(RestClient restClient) {
        this.restClient = restClient;
    }

    TokenResult fetch(WechatMiniCredentials credentials) {
        String cached = cache.get(credentials).orElse(null);
        if (cached != null) {
            return new TokenResult(cached, null);
        }
        // 请求成功由 request 写缓存（窗口取响应 expires_in），失败不缓存以便下次重试
        return request(credentials);
    }

    // 请求渠道：成功带 expires_in 决定缓存窗口
    private TokenResult request(WechatMiniCredentials credentials) {
        JSONObject response = JSONUtil.parseObj(restClient.get()
            .uri(PATH_TOKEN + "?grant_type=" + GRANT_TYPE_CLIENT_CREDENTIAL + "&appid={appid}&secret={secret}",
                credentials.appId(), credentials.appSecret())
            .retrieve()
            .body(String.class));
        if (Errcodes.code(response) != 0) {
            return new TokenResult(null, "获取微信接口凭据失败：" + Errcodes.describe(response));
        }
        String accessToken = response.getStr(KEY_ACCESS_TOKEN);
        if (accessToken == null || accessToken.isEmpty()) {
            return new TokenResult(null, "获取微信接口凭据失败：响应缺少 access_token");
        }
        cache.put(credentials, accessToken, lifetimeMillis(response));
        return new TokenResult(accessToken, null);
    }

    // expires_in 为秒（官方样例 7200）；缺失或非法按官方有效期
    private long lifetimeMillis(JSONObject response) {
        Long expiresIn = response.getLong(KEY_EXPIRES_IN, null);
        return expiresIn == null || expiresIn <= 0 ? DEFAULT_EXPIRE_MILLIS : expiresIn * 1000;
    }
}
