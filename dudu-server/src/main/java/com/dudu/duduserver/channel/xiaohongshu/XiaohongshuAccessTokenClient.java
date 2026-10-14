package com.dudu.duduserver.channel.xiaohongshu;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.support.AccessTokenCache;
import com.dudu.duduserver.channel.support.TokenResult;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 小红书调用凭证换取（事实见 docs/research/channels/xiaohongshu.md §12.2）：POST
 * /api/rmp/token，body 以 JSON 写入 appid/secret；成功取 data.access_token。官方规则
 * 重复获取使上次凭证失效（5 分钟平滑期后过期），必须缓存复用：进程内按凭据组缓存、
 * 剩余不足 30 分钟即换新（口径与飞书/抖音一致），失败不缓存以便重试；复用同一换取
 * 逻辑与同一份失败说明格式，渠道错误原样记录 code 与 msg。官方文档注明错误响应 data
 * 为空、正确响应也不保证非空，缺 token 如实按失败处理。
 */
class XiaohongshuAccessTokenClient {

    private static final String PATH_TOKEN = "/api/rmp/token";
    private static final String KEY_APP_ID = "appid";
    private static final String KEY_SECRET = "secret";
    private static final String KEY_DATA = "data";
    private static final String KEY_ACCESS_TOKEN = "access_token";
    private static final String KEY_EXPIRE_IN = "expire_in";

    // 官方有效期目前 2 小时；响应缺 expire_in 或非法时按此收敛缓存窗口
    private static final long DEFAULT_EXPIRE_MILLIS = Duration.ofHours(2).toMillis();

    private final RestClient restClient;

    // 按凭据组缓存：appId+appSecret 的值等即键，换密后旧缓存自然失效
    private final AccessTokenCache<XiaohongshuSendCredentials> cache = new AccessTokenCache<>();

    XiaohongshuAccessTokenClient(RestClient restClient) {
        this.restClient = restClient;
    }

    TokenResult fetch(XiaohongshuSendCredentials credentials) {
        if (credentials == null) {
            return new TokenResult(null, "获取小红书接口凭据失败：发送凭据未配置");
        }
        String cached = cache.get(credentials).orElse(null);
        if (cached != null) {
            return new TokenResult(cached, null);
        }
        // 请求成功由 request 写缓存（窗口取响应 expire_in），失败不缓存以便下次重试
        return request(credentials);
    }

    // 请求渠道：成功带 expire_in 决定缓存窗口
    private TokenResult request(XiaohongshuSendCredentials credentials) {
        JSONObject response = JSONUtil.parseObj(restClient.post()
            .uri(PATH_TOKEN)
            .body(tokenPayload(credentials))
            .retrieve()
            .body(String.class));
        if (!XiaohongshuErrors.succeeded(response)) {
            return new TokenResult(null, "获取小红书接口凭据失败：" + XiaohongshuErrors.describe(response));
        }
        JSONObject data = response.getJSONObject(KEY_DATA);
        String accessToken = data == null ? null : data.getStr(KEY_ACCESS_TOKEN);
        if (accessToken == null || accessToken.isEmpty()) {
            return new TokenResult(null, "获取小红书接口凭据失败：响应缺少 access_token");
        }
        cache.put(credentials, accessToken, lifetimeMillis(data));
        return new TokenResult(accessToken, null);
    }

    // DC010382 请求示例：{appid, secret}，JSON body（DC853803 通用约定 content-type JSON）
    private Map<String, Object> tokenPayload(XiaohongshuSendCredentials credentials) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put(KEY_APP_ID, credentials.appId());
        payload.put(KEY_SECRET, credentials.appSecret());
        return payload;
    }

    // expire_in 为秒（官方样例 7200，data 内）；缺失或非法按官方当前有效期
    private long lifetimeMillis(JSONObject data) {
        Long expireIn = data == null ? null : data.getLong(KEY_EXPIRE_IN, null);
        return expireIn == null || expireIn <= 0 ? DEFAULT_EXPIRE_MILLIS : expireIn * 1000;
    }
}
