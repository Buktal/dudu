package com.dudu.duduserver.channel.kuaishou;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * 快手 oauth2 令牌操作（事实见 docs/research/channels/kuaishou.md §8，官方 SDK jar
 * 反编译实锤）：GET {oauthBase}/oauth2/access_token 与 /oauth2/refresh_token，query
 * 四参 app_id、app_secret、grant_type（code 与 refresh_token）、code 或 refresh_token；
 * oauth 端点不走网关签名，app_secret 直传 query。响应顶层平铺：result=1 即成功，
 * 取 access_token（默认 86400s 寿命）与 refresh_token（每次刷新轮换，旧值随轮换
 * 失效）；803000/803001 为 token 过期，只能人工重新授权。刷新产物先经
 * KuaishouTokenStore 条件回写 channel_info 再返回成功，防并发双刷互相踢掉对方的
 * 轮换产物；首换供 Console 保存链路同步换取，调用方持有写入权，本客户端不回写。
 */
@Component
public class KuaishouOAuthClient {

    private static final String DEFAULT_API_BASE = "https://openapi.kwaixiaodian.com";
    private static final String PATH_ACCESS_TOKEN = "/oauth2/access_token";
    private static final String PATH_REFRESH_TOKEN = "/oauth2/refresh_token";

    // query 键（§8 buildOauthAccessTokenRequest/buildOauthRefreshTokenRequest 逐字）
    private static final String PARAM_APP_ID = "app_id";
    private static final String PARAM_APP_SECRET = "app_secret";
    private static final String PARAM_GRANT_TYPE = "grant_type";
    private static final String GRANT_CODE = "code";
    private static final String GRANT_REFRESH_TOKEN = "refresh_token";
    private static final String PARAM_CODE = "code";
    private static final String PARAM_REFRESH_TOKEN = "refresh_token";

    // 响应键（§8 KsAccessTokenResponse 的 Gson @SerializedName 逐字，顶层平铺无信封）
    private static final String KEY_RESULT = "result";
    private static final String KEY_ERROR = "error";
    private static final String KEY_ERROR_MSG = "error_msg";
    private static final String KEY_ACCESS_TOKEN = "access_token";
    private static final String KEY_REFRESH_TOKEN = "refresh_token";
    private static final int RESULT_SUCCESS = 1;

    // refreshToken 缺失的如实说明（与 KuaishouTextSender 的直配语境同口径分流）
    static final String TOKEN_REFRESH_MISSING =
        "快手 refreshToken 未完成授权：channel_info 缺少 refreshToken（需完成商家授权后录入，录入后由服务端每日自动轮换 accessToken）";
    static final String APP_SECRET_MISSING =
        "快手令牌链路未完成配置：channel_info 缺少 appSecret（oauth2 令牌端点密钥，平台应用信息中获取后录入）";

    private static final String EXCHANGE_FAILURE_PREFIX = "换取快手令牌失败：";
    private static final String REFRESH_FAILURE_PREFIX = "刷新快手令牌失败：";
    private static final String STORE_CONDITION_MISSED =
        "回写时库内 refreshToken 已变化（并发刷新或重新录入），本次新值放弃";

    private final RestClient restClient;

    private final KuaishouTokenStore store;

    public KuaishouOAuthClient(RestClient.Builder builder,
                               @Value("${dudu.channel.kuaishou.api-base:" + DEFAULT_API_BASE + "}") String apiBase,
                               KuaishouTokenStore store) {
        this.restClient = builder.baseUrl(apiBase).build();
        this.store = store;
    }

    /**
     * 授权码首换（§8）：供 Console 保存链路同步换取——code 按 oauth 族惯例 10 分钟
     * 时效且一次性，等定时任务必失效；产物含双 token（access_token 落库供发送直用），
     * 调用方持有写入权，本客户端不回写。渠道拒绝或响应缺值如实失败。
     */
    public ExchangeResult exchange(String appId, String appSecret, String authCode) {
        // appSecret 为 Console 非必填字段：缺失即如实失败，不把 null 变字符串上送
        if (appSecret == null || appSecret.isBlank()) {
            return new ExchangeResult(null, null, EXCHANGE_FAILURE_PREFIX + APP_SECRET_MISSING);
        }
        try {
            JSONObject response = JSONUtil.parseObj(restClient.get()
                .uri(uri -> uri.path(PATH_ACCESS_TOKEN)
                    .queryParam(PARAM_APP_ID, appId)
                    .queryParam(PARAM_APP_SECRET, appSecret)
                    .queryParam(PARAM_GRANT_TYPE, GRANT_CODE)
                    .queryParam(PARAM_CODE, authCode)
                    .build())
                .retrieve()
                .body(String.class));
            String failure = describeFailure(response, EXCHANGE_FAILURE_PREFIX);
            if (failure != null) {
                return new ExchangeResult(null, null, failure);
            }
            String accessToken = response.getStr(KEY_ACCESS_TOKEN, null);
            String refreshToken = response.getStr(KEY_REFRESH_TOKEN, null);
            if (accessToken == null || accessToken.isBlank() || refreshToken == null || refreshToken.isBlank()) {
                return new ExchangeResult(null, null, EXCHANGE_FAILURE_PREFIX + "响应缺少 access_token 或 refresh_token");
            }
            return new ExchangeResult(accessToken, refreshToken, null);
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应解析异常都按调用失败记录，不猜测换取结果
            return new ExchangeResult(null, null, EXCHANGE_FAILURE_PREFIX + e.getMessage());
        }
    }

    // 刷新并条件回写：refreshToken 缺失、渠道拒绝或回写未生效均如实失败；成功后
    // 发送链路读库内新 accessToken 即生效，无须令牌缓存失效动作
    public RefreshResult refresh(CompanyChannelDO account, KuaishouCredentials credentials) {
        if (credentials.refreshToken() == null) {
            return new RefreshResult(null, null, TOKEN_REFRESH_MISSING);
        }
        // 刷新四参契约必含 app_secret：缺失即如实失败不出网（appSecret 为 Console
        // 非必填字段，只手录 refreshToken 未配 appSecret 的账号走此分支留痕）
        if (credentials.appSecret() == null || credentials.appSecret().isBlank()) {
            return new RefreshResult(null, null, REFRESH_FAILURE_PREFIX + APP_SECRET_MISSING);
        }
        try {
            JSONObject response = JSONUtil.parseObj(restClient.get()
                .uri(uri -> uri.path(PATH_REFRESH_TOKEN)
                    .queryParam(PARAM_APP_ID, credentials.appKey())
                    .queryParam(PARAM_APP_SECRET, credentials.appSecret())
                    .queryParam(PARAM_GRANT_TYPE, GRANT_REFRESH_TOKEN)
                    .queryParam(PARAM_REFRESH_TOKEN, credentials.refreshToken())
                    .build())
                .retrieve()
                .body(String.class));
            String failure = describeFailure(response, REFRESH_FAILURE_PREFIX);
            if (failure != null) {
                return new RefreshResult(null, null, failure);
            }
            String accessToken = response.getStr(KEY_ACCESS_TOKEN, null);
            String refreshToken = response.getStr(KEY_REFRESH_TOKEN, null);
            if (accessToken == null || accessToken.isBlank() || refreshToken == null || refreshToken.isBlank()) {
                return new RefreshResult(null, null, REFRESH_FAILURE_PREFIX + "响应缺少 access_token 或 refresh_token");
            }
            // 先条件回写再返回成功：refreshToken 已轮换，新值不落库则下次仍拿旧值
            // 刷新必然失败；未生效即库内已被并发改写，放弃本次产物防双刷互踢
            if (!store.storeIfCurrent(account.getCompanyChannelId(), credentials.refreshToken(),
                accessToken, refreshToken, System.currentTimeMillis())) {
                return new RefreshResult(null, null, REFRESH_FAILURE_PREFIX + STORE_CONDITION_MISSED);
            }
            return new RefreshResult(accessToken, refreshToken, null);
        } catch (RuntimeException e) {
            // 网络与 HTTP 状态异常按调用失败记录，store 回写异常同此路径，不猜测轮换结果
            return new RefreshResult(null, null, REFRESH_FAILURE_PREFIX + e.getMessage());
        }
    }

    // 首换产物：双 token，失败文案为空即成功
    public record ExchangeResult(String accessToken, String refreshToken, String failureReason) {

        public boolean succeeded() {
            return accessToken != null;
        }
    }

    // 刷新产物：双 token，失败文案为空即成功
    public record RefreshResult(String accessToken, String refreshToken, String failureReason) {

        public boolean succeeded() {
            return accessToken != null;
        }
    }

    // 错误形态防御式解析：result 非 1 即失败，error/error_msg 可能缺省（§8 响应字段
    // 表两者独立存在）；无 result 键不判失败，缺失令牌由调用侧兜底文案报告
    private String describeFailure(JSONObject response, String failurePrefix) {
        Integer result = response.getInt(KEY_RESULT, null);
        if (result == null || result == RESULT_SUCCESS) {
            return null;
        }
        String error = response.getStr(KEY_ERROR, null);
        String errorMsg = response.getStr(KEY_ERROR_MSG, null);
        return failurePrefix + result
            + (error == null || error.isBlank() ? "" : " " + error)
            + (errorMsg == null || errorMsg.isBlank() ? "" : " " + errorMsg)
            + adviceOf(error);
    }

    // 已知错误码附处置建议（§8/§7.4 工程参数）：803000/803001 在 error 字符串字段
    //（网关族令牌过期码），无重试意义，只能人工重新授权
    private String adviceOf(String error) {
        if (error == null) {
            return "";
        }
        return error.startsWith("803000") || error.startsWith("803001")
            ? "（token 已过期，需运营重新授权后录入）" : "";
    }

}
