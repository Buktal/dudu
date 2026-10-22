package com.dudu.duduserver.channel.qq;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.support.AccessTokenCache;
import com.dudu.duduserver.channel.support.AccessTokenCache.FetchedToken;
import com.dudu.duduserver.channel.support.TokenResult;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.Map;

/**
 * QQ access_token 换取（事实见 docs/research/channels/qq.md §5.10/§6）：用 channel_info
 * 的 appId/appSecret 请求 POST /app/getAppAccessToken（body 字段 appId/clientSecret）。
 * 默认 7200 秒、临期 60 秒内获取发新值：进程内按凭据组缓存复用、剩余不足 30 分钟即换新
 * （口径与飞书/抖音一致），失败不缓存以便重试。失败响应是 {code, message} 且 HTTP 恒
 * 200，官方明确依据 code 判断——与 OpenAPI 业务失败体 {err_code,...} 字段名不同；
 * expires_in 表格口径 number、示例为字符串，解析按两者兼容，缺失按默认窗口。
 */
class QqAccessTokenClient {

    private static final String PATH_TOKEN = "/app/getAppAccessToken";
    private static final String KEY_ACCESS_TOKEN = "access_token";
    private static final String KEY_EXPIRES_IN = "expires_in";
    private static final String KEY_CODE = "code";
    private static final String KEY_MESSAGE = "message";
    private static final String SUCCESS_CODE = "0";

    // 官方有效期 7200 秒；响应缺 expires_in 或非法时按此收敛缓存窗口
    private static final long DEFAULT_EXPIRE_MILLIS = Duration.ofHours(2).toMillis();

    private final RestClient restClient;

    // 按凭据组缓存：appId+appSecret 的值等即键，换密后旧缓存自然失效
    private final AccessTokenCache<QqCredentials> cache = new AccessTokenCache<>();

    QqAccessTokenClient(RestClient restClient) {
        this.restClient = restClient;
    }

    TokenResult fetch(QqCredentials credentials) {
        // 缓存单飞：同键并发未命中只发一次 HTTP，失败不缓存以便重试，网络异常原样上抛
        return cache.getOrLoad(credentials, () -> request(credentials));
    }

    // 请求渠道：成功带 expires_in 决定缓存窗口，失败带已成型的原因说明（不写缓存以便重试）
    private FetchedToken request(QqCredentials credentials) {
        JSONObject response = JSONUtil.parseObj(restClient.post()
            .uri(PATH_TOKEN)
            .body(Map.of("appId", credentials.appId(), "clientSecret", credentials.appSecret()))
            .retrieve()
            .body(String.class));
        // 官方口径：业务失败通过 code 判断（不要通过 HTTP 状态码，也不要通过 message）
        String code = response.getStr(KEY_CODE);
        if (code != null && !code.isEmpty() && !SUCCESS_CODE.equals(code)) {
            return FetchedToken.failed("获取QQ接口凭据失败：" + code + " " + response.getStr(KEY_MESSAGE, ""));
        }
        String accessToken = response.getStr(KEY_ACCESS_TOKEN);
        if (accessToken == null || accessToken.isEmpty()) {
            return FetchedToken.failed("获取QQ接口凭据失败：响应缺少 access_token");
        }
        return FetchedToken.fetched(accessToken,
            AccessTokenCache.expiresInMillis(response, KEY_EXPIRES_IN, DEFAULT_EXPIRE_MILLIS));
    }

    // expires_in 表格口径 number、示例为字符串，hutool 两者均可转秒；缺失按官方有效期
}
