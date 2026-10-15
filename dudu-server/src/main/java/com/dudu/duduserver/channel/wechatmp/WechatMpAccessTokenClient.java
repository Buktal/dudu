package com.dudu.duduserver.channel.wechatmp;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.support.AccessTokenCache;
import com.dudu.duduserver.channel.support.AccessTokenCache.FetchedToken;
import com.dudu.duduserver.channel.support.Errcodes;
import com.dudu.duduserver.channel.support.TokenResult;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/**
 * 公众号 access_token 换取（事实见 docs/research/channels/wechat-mp.md §6）：用 channel_info
 * 的 appId/appSecret 请求 /cgi-bin/token，expires_in 7200。缓存口径与同一端点的小程序一致
 * （wechat-mini.md §6.1：官方要求服务端妥善缓存）：进程内按凭据组缓存复用、剩余不足 30
 * 分钟即换新（口径与飞书/抖音一致），失败不缓存以便重试；复用同一换取逻辑与同一份失败
 * 说明格式，渠道错误原样记录 errcode 与 errmsg。
 */
class WechatMpAccessTokenClient {

    private static final String PATH_TOKEN = "/cgi-bin/token";
    private static final String GRANT_TYPE_CLIENT_CREDENTIAL = "client_credential";
    private static final String KEY_ACCESS_TOKEN = "access_token";
    private static final String KEY_EXPIRES_IN = "expires_in";

    // 官方有效期 7200 秒；响应缺 expires_in 或非法时按此收敛缓存窗口
    private static final long DEFAULT_EXPIRE_MILLIS = Duration.ofHours(2).toMillis();

    private final RestClient restClient;

    // 按凭据组缓存：appId+appSecret 的值等即键，换密后旧缓存自然失效
    private final AccessTokenCache<WechatMpCredentials> cache = new AccessTokenCache<>();

    WechatMpAccessTokenClient(RestClient restClient) {
        this.restClient = restClient;
    }

    TokenResult fetch(WechatMpCredentials credentials) {
        // 缓存单飞：同键并发未命中只发一次 HTTP，失败不缓存以便重试，网络异常原样上抛
        return cache.getOrLoad(credentials, () -> request(credentials));
    }

    // 请求渠道：成功带 expires_in 决定缓存窗口，失败带已成型的原因说明（不写缓存以便重试）
    private FetchedToken request(WechatMpCredentials credentials) {
        JSONObject response = JSONUtil.parseObj(restClient.get()
            .uri(PATH_TOKEN + "?grant_type=" + GRANT_TYPE_CLIENT_CREDENTIAL + "&appid={appid}&secret={secret}",
                credentials.appId(), credentials.appSecret())
            .retrieve()
            .body(String.class));
        if (Errcodes.code(response) != 0) {
            return FetchedToken.failed("获取微信接口凭据失败：" + Errcodes.describe(response));
        }
        String accessToken = response.getStr(KEY_ACCESS_TOKEN);
        if (accessToken == null || accessToken.isEmpty()) {
            return FetchedToken.failed("获取微信接口凭据失败：响应缺少 access_token");
        }
        return FetchedToken.fetched(accessToken, lifetimeMillis(response));
    }

    // expires_in 为秒（官方样例 7200）；缺失或非法按官方有效期
    private long lifetimeMillis(JSONObject response) {
        Long expiresIn = response.getLong(KEY_EXPIRES_IN, null);
        return expiresIn == null || expiresIn <= 0 ? DEFAULT_EXPIRE_MILLIS : expiresIn * 1000;
    }
}
