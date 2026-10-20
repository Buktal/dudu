package com.dudu.duduserver.channel.support;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.function.Function;

/**
 * 微信族 access_token 换取骨架：公众号与小程序同 URL 同协议（docs/research/channels/
 * wechat-mp.md §6、wechat-mini.md §6.1/§6.2，同一 GET /cgi-bin/token、expires_in 7200，
 * 官方要求服务端妥善缓存）；wecom 为真分叉（/cgi-bin/gettoken、corpId/corpSecret 凭据）
 * 不在此列。渠道薄层以凭据类型与 appId/appSecret 取值函数参数化（ADR-0014：凭据收窄
 * 住在渠道包内，本骨架不统一凭据层）。缓存口径：进程内按凭据组缓存复用（凭据 record 的
 * 值等即键，换密后旧缓存自然失效）、剩余不足 30 分钟即换新（口径与飞书/抖音一致），
 * 失败不缓存以便重试；渠道错误原样记录 errcode 与 errmsg。
 */
public final class WechatTokenClient<C> {

    private static final String PATH_TOKEN = "/cgi-bin/token";
    private static final String GRANT_TYPE_CLIENT_CREDENTIAL = "client_credential";
    private static final String KEY_ACCESS_TOKEN = "access_token";
    private static final String KEY_EXPIRES_IN = "expires_in";

    // 官方有效期 7200 秒；响应缺 expires_in 或非法时按此收敛缓存窗口
    private static final long DEFAULT_EXPIRE_MILLIS = Duration.ofHours(2).toMillis();

    private final RestClient restClient;

    // 渠道薄层的凭据取值：从渠道凭据 record 读 appId 与 appSecret
    private final Function<C, String> appIdOf;

    private final Function<C, String> appSecretOf;

    // 按凭据组缓存：凭据 record 的值等即键，换密后旧缓存自然失效
    private final AccessTokenCache<C> cache = new AccessTokenCache<>();

    public WechatTokenClient(RestClient restClient, Function<C, String> appIdOf, Function<C, String> appSecretOf) {
        this.restClient = restClient;
        this.appIdOf = appIdOf;
        this.appSecretOf = appSecretOf;
    }

    public TokenResult fetch(C credentials) {
        // 缓存单飞：同键并发未命中只发一次 HTTP，失败不缓存以便重试，网络异常原样上抛
        return cache.getOrLoad(credentials, () -> request(credentials));
    }

    // 请求渠道：成功带 expires_in 决定缓存窗口，失败带已成型的原因说明（不写缓存以便重试）
    private AccessTokenCache.FetchedToken request(C credentials) {
        JSONObject response = JSONUtil.parseObj(restClient.get()
            .uri(PATH_TOKEN + "?grant_type=" + GRANT_TYPE_CLIENT_CREDENTIAL + "&appid={appid}&secret={secret}",
                appIdOf.apply(credentials), appSecretOf.apply(credentials))
            .retrieve()
            .body(String.class));
        if (Errcodes.code(response) != 0) {
            return AccessTokenCache.FetchedToken.failed("获取微信接口凭据失败：" + Errcodes.describe(response));
        }
        String accessToken = response.getStr(KEY_ACCESS_TOKEN);
        if (accessToken == null || accessToken.isEmpty()) {
            return AccessTokenCache.FetchedToken.failed("获取微信接口凭据失败：响应缺少 access_token");
        }
        return AccessTokenCache.FetchedToken.fetched(accessToken, lifetimeMillis(response));
    }

    // expires_in 为秒（官方样例 7200）；缺失或非法按官方有效期
    private long lifetimeMillis(JSONObject response) {
        Long expiresIn = response.getLong(KEY_EXPIRES_IN, null);
        return expiresIn == null || expiresIn <= 0 ? DEFAULT_EXPIRE_MILLIS : expiresIn * 1000;
    }
}
