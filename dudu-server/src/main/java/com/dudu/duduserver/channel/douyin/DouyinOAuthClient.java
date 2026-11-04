package com.dudu.duduserver.channel.douyin;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

/**
 * 抖音 oauth 凭证操作（事实见 docs/research/channels/douyin.md §6、§9.6）：授权码
 * 首换 POST /oauth/access_token/（form：client_key、client_secret、code、
 * grant_type=authorization_code，code 10 分钟时效且一次性）换取首个 refreshToken
 * （access_token 按需由 DouyinTokenClient 以 refreshToken 换取并缓存，不落库）；
 * refresh_token 是 30 天轮换凭证——续期 POST /oauth/renew_refresh_token/（form 仅
 * client_key 与 refresh_token 两参，无 client_secret、无 access-token 头）返回新
 * refresh_token，旧值调用后立即失效，每次重置 30 天，同一授权链至多续 5 次（此后
 * 需用户重新授权）。续期产物先经 DouyinRefreshTokenStore 条件回写 channel_info
 * 再返回成功，防并发双刷互相踢掉对方的轮换产物。错误全以 HTTP 200 返回：10004 需
 * 申请 renew_refresh_token 权限、10007 code 已用或过期、10010 refreshToken 已过期、
 * 10020 续期次数用尽，均只能人工处置；expires_in 官方示例为字符串且与 30 天条款
 * 矛盾，不作节奏依据（续期间隔由 DouyinRefreshTokenRefresher 控制）。
 */
@Component
public class DouyinOAuthClient {

    private static final String DEFAULT_API_BASE = "https://open.douyin.com";
    private static final String PATH_ACCESS_TOKEN = "/oauth/access_token/";
    private static final String PATH_RENEW = "/oauth/renew_refresh_token/";

    // form 键（§6/§9.6 官方契约逐字）
    private static final String KEY_CLIENT_KEY = "client_key";
    private static final String KEY_CLIENT_SECRET = "client_secret";
    private static final String KEY_CODE = "code";
    private static final String KEY_GRANT_TYPE = "grant_type";
    private static final String GRANT_AUTHORIZATION_CODE = "authorization_code";
    private static final String KEY_REFRESH_TOKEN = "refresh_token";

    // 响应信封键（oauth 族同款：顶层 data + message）
    private static final String KEY_DATA = "data";
    private static final String KEY_ERROR_CODE = "error_code";
    private static final String KEY_DESCRIPTION = "description";
    private static final String KEY_NEXT_REFRESH_TOKEN = "refresh_token";
    private static final int ERROR_CODE_SUCCESS = 0;

    // refreshToken 缺失的如实说明（与 DouyinTokenClient 的换取语境同口径分流）
    static final String TOKEN_RENEW_MISSING =
        "抖音 refreshToken 未完成用户授权：channel_info 缺少 refreshToken（需运营完成抖音号授权后录入）";

    private static final String EXCHANGE_FAILURE_PREFIX = "换取抖音 refreshToken 失败：";
    private static final String RENEW_FAILURE_PREFIX = "续期抖音 refreshToken 失败：";
    private static final String STORE_CONDITION_MISSED =
        "回写时库内 refreshToken 已变化（并发续期或重新录入），本次新值放弃";

    private final RestClient restClient;

    private final DouyinRefreshTokenStore store;

    public DouyinOAuthClient(RestClient.Builder builder,
                             @Value("${dudu.channel.douyin.api-base:" + DEFAULT_API_BASE + "}") String apiBase,
                             DouyinRefreshTokenStore store) {
        this.restClient = builder.baseUrl(apiBase).build();
        this.store = store;
    }

    /**
     * 授权码首换（§6）：供 Console 保存链路同步换取——code 10 分钟时效且一次性，
     * 等定时任务必失效；产物只含 refreshToken（access_token 不落库，由发送链路按需
     * 换取），调用方持有写入权，本客户端不回写。渠道拒绝或响应缺新值如实失败。
     */
    public ExchangeResult exchange(String clientKey, String clientSecret, String authCode) {
        try {
            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            form.add(KEY_CLIENT_KEY, clientKey);
            form.add(KEY_CLIENT_SECRET, clientSecret);
            form.add(KEY_CODE, authCode);
            form.add(KEY_GRANT_TYPE, GRANT_AUTHORIZATION_CODE);
            JSONObject response = JSONUtil.parseObj(restClient.post()
                .uri(PATH_ACCESS_TOKEN)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .retrieve()
                .body(String.class));
            String failure = describeFailure(response, EXCHANGE_FAILURE_PREFIX);
            if (failure != null) {
                return new ExchangeResult(null, failure);
            }
            JSONObject data = response.getJSONObject(KEY_DATA);
            String refreshToken = data == null ? null : data.getStr(KEY_NEXT_REFRESH_TOKEN, null);
            if (refreshToken == null || refreshToken.isBlank()) {
                return new ExchangeResult(null, EXCHANGE_FAILURE_PREFIX + "响应缺少 refresh_token");
            }
            return new ExchangeResult(refreshToken, null);
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应解析异常都按调用失败记录，不猜测换取结果
            return new ExchangeResult(null, EXCHANGE_FAILURE_PREFIX + e.getMessage());
        }
    }

    // 续期并条件回写：refreshToken 缺失、渠道拒绝或回写未生效均如实失败；续期成功
    // 不影响 access_token 缓存——AccessTokenCache 按 clientKey+refreshToken 键，
    // 新值落库后旧键自然失配
    public RenewResult renew(CompanyChannelDO account, DouyinCredentials credentials) {
        if (credentials.refreshToken() == null) {
            return new RenewResult(null, TOKEN_RENEW_MISSING);
        }
        try {
            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            form.add(KEY_CLIENT_KEY, credentials.clientKey());
            form.add(KEY_REFRESH_TOKEN, credentials.refreshToken());
            JSONObject response = JSONUtil.parseObj(restClient.post()
                .uri(PATH_RENEW)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .retrieve()
                .body(String.class));
            String failure = describeFailure(response, RENEW_FAILURE_PREFIX);
            if (failure != null) {
                return new RenewResult(null, failure);
            }
            JSONObject data = response.getJSONObject(KEY_DATA);
            String nextRefreshToken = data == null ? null : data.getStr(KEY_NEXT_REFRESH_TOKEN, null);
            if (nextRefreshToken == null || nextRefreshToken.isBlank()) {
                return new RenewResult(null, RENEW_FAILURE_PREFIX + "响应缺少新 refresh_token");
            }
            // 先条件回写再返回成功：旧值已失效，新值不落库则重启后失去续期能力；
            // 未生效即库内 refreshToken 已被并发改写，放弃本次产物防双刷互踢
            if (!store.storeIfCurrent(account.getCompanyChannelId(), credentials.refreshToken(),
                nextRefreshToken, System.currentTimeMillis())) {
                return new RenewResult(null, RENEW_FAILURE_PREFIX + STORE_CONDITION_MISSED);
            }
            return new RenewResult(nextRefreshToken, null);
        } catch (RuntimeException e) {
            // 网络与 HTTP 状态异常按调用失败记录，store 回写异常同此路径，不猜测轮换结果
            return new RenewResult(null, RENEW_FAILURE_PREFIX + e.getMessage());
        }
    }

    // 首换产物：首个 refreshToken，失败文案为空即成功
    public record ExchangeResult(String refreshToken, String failureReason) {

        public boolean succeeded() {
            return refreshToken != null;
        }
    }

    // 续期产物：新 refreshToken，失败文案为空即成功
    public record RenewResult(String refreshToken, String failureReason) {

        public boolean succeeded() {
            return refreshToken != null;
        }
    }

    // 错误形态防御式解析：error_code 在 data 内或顶层（§9.6 异常样例在 data 内），
    // 无 error_code 不判失败，缺失新值由调用侧兜底文案报告
    private String describeFailure(JSONObject response, String failurePrefix) {
        JSONObject data = response.getJSONObject(KEY_DATA);
        Object errorCode = data != null && data.containsKey(KEY_ERROR_CODE)
            ? data.get(KEY_ERROR_CODE) : response.get(KEY_ERROR_CODE);
        if (errorCode == null) {
            return null;
        }
        if (errorCode instanceof Number number && number.longValue() == ERROR_CODE_SUCCESS) {
            return null;
        }
        String description = data != null && data.getStr(KEY_DESCRIPTION, null) != null
            ? data.getStr(KEY_DESCRIPTION) : response.getStr("message", null);
        return failurePrefix + errorCode
            + (description == null || description.isBlank() ? "" : " " + description)
            + adviceOf(errorCode);
    }

    // 已知错误码附官方处置建议（§6/§9.6 错误码表浓缩）：所列各码均无重试意义
    private String adviceOf(Object errorCode) {
        if (!(errorCode instanceof Number number)) {
            return "";
        }
        return switch ((int) number.longValue()) {
            case 10004 -> "（需在抖音开放平台申请 renew_refresh_token 权限）";
            case 10007 -> "（授权码已使用或已过期，请重新授权获取新码）";
            case 10010 -> "（refreshToken 已过期，需运营重新授权后录入）";
            case 10020 -> "（续期次数已达上限，需运营重新授权后录入）";
            default -> "";
        };
    }

}
