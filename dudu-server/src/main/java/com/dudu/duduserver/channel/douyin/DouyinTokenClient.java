package com.dudu.duduserver.channel.douyin;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.support.AccessTokenCache;
import com.dudu.duduserver.channel.support.AccessTokenCache.FetchedToken;
import com.dudu.duduserver.channel.support.TokenResult;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/**
 * 抖音接口凭据换取（事实见 docs/research/channels/douyin.md §6、§6.1）：发送私信
 * 是用户授权类接口，access_token 只能由用户授权链路获得——以 channel_info 的
 * refreshToken POST /oauth/refresh_token/（form-urlencoded：client_key、client_secret、
 * refresh_token、grant_type=refresh_token）续期，15 天寿命、刷新不续 refresh_token
 * 自身；access_token 与用户授权绑定，进程内按 clientKey+refreshToken 缓存复用
 * （AccessTokenCache 骨架，剩余不足 30 分钟视为过期；同一 clientKey 换绑到另一
 * 授权用户后旧缓存自然失效），窗口取响应 expires_in，失败不缓存以便重试。
 * 渠道错误原样记录 code 与 description；用户取消授权后 access_token 即时失效。
 */
class DouyinTokenClient {

    private static final String PATH_REFRESH = "/oauth/refresh_token/";
    private static final String KEY_CLIENT_KEY = "client_key";
    private static final String KEY_CLIENT_SECRET = "client_secret";
    private static final String KEY_REFRESH_TOKEN = "refresh_token";
    private static final String KEY_GRANT_TYPE = "grant_type";
    private static final String GRANT_REFRESH_TOKEN = "refresh_token";
    private static final String KEY_DATA = "data";
    private static final String KEY_ACCESS_TOKEN = "access_token";
    private static final String KEY_EXPIRES_IN = "expires_in";
    private static final String KEY_ERROR_CODE = "error_code";
    private static final String KEY_DESCRIPTION = "description";

    // §6：access_token 寿命 15 天（expires_in=1296000）；响应缺 expires_in 时按此处理
    private static final long DEFAULT_EXPIRE_MILLIS = Duration.ofDays(15).toMillis();

    // refreshToken 缺失的如实说明：不编造可发能力，指引完成用户授权（适配器限制说明同源）
    static final String REFRESH_TOKEN_MISSING =
        "抖音发送未完成用户授权：channel_info 缺少 refreshToken（需运营完成抖音号授权后录入）";

    private final RestClient restClient;

    // 按 clientKey+refreshToken 缓存：access_token 是用户授权凭据，同 clientKey 换绑
    // 授权后 refreshToken 变化，旧缓存不可复用
    private final AccessTokenCache<CacheKey> cache = new AccessTokenCache<>();

    DouyinTokenClient(RestClient restClient) {
        this.restClient = restClient;
    }

    // 缓存键：同一应用（clientKey）的不同授权用户以 refreshToken 区分
    private record CacheKey(String clientKey, String refreshToken) {
    }

    TokenResult fetch(DouyinCredentials credentials) {
        if (credentials.refreshToken() == null) {
            return new TokenResult(null, REFRESH_TOKEN_MISSING);
        }
        // 缓存单飞：同键并发未命中只发一次 HTTP，失败不缓存以便重试，网络异常按失败返回
        return cache.getOrLoad(new CacheKey(credentials.clientKey(), credentials.refreshToken()),
            () -> request(credentials));
    }

    // 请求渠道：form 四参（§6），access_token 出现即成功并按 expires_in 决定缓存窗口
    private FetchedToken request(DouyinCredentials credentials) {
        try {
            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            form.add(KEY_CLIENT_KEY, credentials.clientKey());
            form.add(KEY_CLIENT_SECRET, credentials.clientSecret());
            form.add(KEY_REFRESH_TOKEN, credentials.refreshToken());
            form.add(KEY_GRANT_TYPE, GRANT_REFRESH_TOKEN);
            JSONObject response = JSONUtil.parseObj(restClient.post()
                .uri(PATH_REFRESH)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .retrieve()
                .body(String.class));
            String failure = describeFailure(response);
            if (failure != null) {
                return FetchedToken.failed(failure);
            }
            JSONObject data = response.getJSONObject(KEY_DATA);
            String accessToken = data == null ? null : data.getStr(KEY_ACCESS_TOKEN, null);
            if (accessToken == null || accessToken.isBlank()) {
                return FetchedToken.failed("获取抖音接口凭据失败：响应缺少 access_token");
            }
            return FetchedToken.fetched(accessToken,
            AccessTokenCache.expiresInMillis(response.getJSONObject(KEY_DATA), KEY_EXPIRES_IN, DEFAULT_EXPIRE_MILLIS));
        } catch (RuntimeException e) {
            return FetchedToken.failed("获取抖音接口凭据失败：" + e.getMessage());
        }
    }

    // 错误形态防御式解析：error_code 在 data 内或顶层（oauth 信封官方样例未逐字核验，§6.1 注）
    private String describeFailure(JSONObject response) {
        JSONObject data = response.getJSONObject(KEY_DATA);
        Object errorCode = data != null && data.containsKey(KEY_ERROR_CODE)
            ? data.get(KEY_ERROR_CODE) : response.get(KEY_ERROR_CODE);
        if (errorCode instanceof Number number && number.longValue() == 0) {
            return null;
        }
        if (errorCode == null) {
            return null;
        }
        String description = data != null && data.getStr(KEY_DESCRIPTION, null) != null
            ? data.getStr(KEY_DESCRIPTION) : response.getStr("message", null);
        return "获取抖音接口凭据失败：" + errorCode + (description == null ? "" : " " + description);
    }

}
