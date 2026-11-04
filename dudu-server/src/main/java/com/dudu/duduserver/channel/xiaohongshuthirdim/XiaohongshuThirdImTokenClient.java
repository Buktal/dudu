package com.dudu.duduserver.channel.xiaohongshuthirdim;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.support.TokenResult;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * 小红书私信三方令牌链路（事实见 docs/research/channels/xiaohongshu.md §13.4，
 * 4808/4945）：授权码首换 POST /api/open/oauth2/access_token（body {app_id(long)、
 * secret、auth_code}，auth_code 10 分钟时效）与刷新 POST /api/open/oauth2/refresh_token
 * （body {app_id(long)、secret、refresh_token}）；两者响应同款信封 {code:0、success、
 * msg、data{access_token、
 * access_token_expires_in、refresh_token、refresh_token_expires_in、user_id、...}}
 * （4945 黄金信封逐字，data 字段即全集）。每次刷新轮换双 token 并重置有效期，旧
 * token 5 分钟后失效——轮换产物先经 XiaohongshuThirdImTokenStore 持久化回
 * channel_info 再返回，进程重启后仍可续期。不做进程内缓存：缓存键按凭据组区分而
 * 本渠道 refreshToken 每次轮换，键必失配；按账号身份缓存又需锁内重读库内最新
 * refreshToken，超出本包边界——当前唯一消费方是定时轮换 job，发送规格到手后按
 * 真实消费路径再补。渠道错误原样记录 code 与 msg；网关默认 adapi 域，可用
 * dudu.channel.xiaohongshu-third-im.api-base 覆盖为受控替身。
 */
@Component
public class XiaohongshuThirdImTokenClient {

    private static final String DEFAULT_API_BASE = "https://adapi.xiaohongshu.com";
    private static final String PATH_ACCESS_TOKEN = "/api/open/oauth2/access_token";
    private static final String PATH_REFRESH = "/api/open/oauth2/refresh_token";

    // 请求 body 键（§13.4 逐字：app_id 为 long）
    private static final String KEY_APP_ID = "app_id";
    private static final String KEY_SECRET = "secret";
    private static final String KEY_REFRESH_TOKEN = "refresh_token";
    private static final String KEY_AUTH_CODE = "auth_code";

    // 响应信封键（4945 示例逐字）；code=0 为成功
    private static final String KEY_CODE = "code";
    private static final int CODE_SUCCESS = 0;
    private static final String KEY_MSG = "msg";
    private static final String KEY_DATA = "data";
    private static final String KEY_ACCESS_TOKEN = "access_token";
    private static final String KEY_NEXT_REFRESH_TOKEN = "refresh_token";

    // refreshToken 缺失的如实说明：授权链路未完成，需运营走 ad-market 授权后录入
    static final String TOKEN_REFRESH_MISSING =
        "小红书私信三方令牌未完成授权：channel_info 缺少 refreshToken（需运营完成授权换取后录入）";

    // 失败文案前缀（首换与刷新各自成句）
    private static final String FAILURE_EXCHANGE_PREFIX = "换取小红书私信三方令牌失败：";
    private static final String FAILURE_REFRESH_PREFIX = "刷新小红书私信三方令牌失败：";

    private final RestClient restClient;

    private final XiaohongshuThirdImTokenStore store;

    public XiaohongshuThirdImTokenClient(RestClient.Builder builder,
                                         @Value("${dudu.channel.xiaohongshu-third-im.api-base:" + DEFAULT_API_BASE + "}") String apiBase,
                                         XiaohongshuThirdImTokenStore store) {
        this.restClient = builder.baseUrl(apiBase).build();
        this.store = store;
    }

    // 刷新并持久化轮换产物：refreshToken 缺失、app_id 非数值或渠道拒绝都如实失败，
    // 回写失败按调用异常处理（新 token 未落库即不可靠，返回失败促重试）
    public TokenResult refresh(CompanyChannelDO account, XiaohongshuThirdImCredentials credentials) {
        if (credentials.refreshToken() == null) {
            return new TokenResult(null, TOKEN_REFRESH_MISSING);
        }
        Long appId = appIdOf(credentials.appId());
        if (appId == null) {
            return new TokenResult(null, FAILURE_REFRESH_PREFIX
                + "app_id 不是合法数值（" + credentials.appId() + "）");
        }
        try {
            String body = JSONUtil.createObj()
                .set(KEY_APP_ID, appId)
                .set(KEY_SECRET, credentials.secret())
                .set(KEY_REFRESH_TOKEN, credentials.refreshToken())
                .toString();
            JSONObject response = JSONUtil.parseObj(restClient.post()
                .uri(PATH_REFRESH)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(String.class));
            String[] tokens = envelopePairOf(response);
            if (tokens == null) {
                return new TokenResult(null, failureOf(response, FAILURE_REFRESH_PREFIX));
            }
            // 先持久化再返回：旧 token 5 分钟后失效，轮换产物不落库则重启后失去续期能力
            store.store(account.getCompanyChannelId(), tokens[0], tokens[1]);
            return new TokenResult(tokens[0], null);
        } catch (RuntimeException e) {
            // 网络与 HTTP 状态异常按调用失败记录，store 回写失败同此路径，不猜测轮换结果
            return new TokenResult(null, FAILURE_REFRESH_PREFIX + e.getMessage());
        }
    }

    /**
     * 授权码首换（§13.4：POST /api/open/oauth2/access_token，body {app_id、secret、
     * auth_code}，响应与刷新同款信封）：auth_code 10 分钟时效且一次性，供 Console 保存
     * 链路同步换取。产物不经 store 回写——调用发生在账号落库前，由调用方持有写入权；
     * app_id 非数值、渠道拒绝或响应缺轮换双 token 均如实失败。
     */
    public ExchangeResult exchange(String appId, String secret, String authCode) {
        Long appIdValue = appIdOf(appId);
        if (appIdValue == null) {
            return new ExchangeResult(null, null, FAILURE_EXCHANGE_PREFIX + "app_id 不是合法数值（" + appId + "）");
        }
        try {
            String body = JSONUtil.createObj()
                .set(KEY_APP_ID, appIdValue)
                .set(KEY_SECRET, secret)
                .set(KEY_AUTH_CODE, authCode)
                .toString();
            JSONObject response = JSONUtil.parseObj(restClient.post()
                .uri(PATH_ACCESS_TOKEN)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(String.class));
            String[] tokens = envelopePairOf(response);
            if (tokens == null) {
                return new ExchangeResult(null, null, failureOf(response, FAILURE_EXCHANGE_PREFIX));
            }
            return new ExchangeResult(tokens[0], tokens[1], null);
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应解析异常都按调用失败记录，不猜测换取结果
            return new ExchangeResult(null, null, FAILURE_EXCHANGE_PREFIX + e.getMessage());
        }
    }

    // 首换产物：双 token 交调用方随保存落库，失败文案为空即成功
    public record ExchangeResult(String accessToken, String refreshToken, String failureReason) {

        public boolean succeeded() {
            return failureReason == null;
        }
    }

    // 信封判定（首换与刷新同款黄金信封）：code 非 0 或 data 缺任一轮换 token 返回 null
    private String[] envelopePairOf(JSONObject response) {
        Integer code = response.getInt(KEY_CODE, null);
        if (code == null || code != CODE_SUCCESS) {
            return null;
        }
        JSONObject data = response.getJSONObject(KEY_DATA);
        String accessToken = data == null ? null : data.getStr(KEY_ACCESS_TOKEN, null);
        String refreshToken = data == null ? null : data.getStr(KEY_NEXT_REFRESH_TOKEN, null);
        if (accessToken == null || accessToken.isBlank() || refreshToken == null || refreshToken.isBlank()) {
            return null;
        }
        return new String[]{accessToken, refreshToken};
    }

    // 信封失败文案：区分渠道拒绝（code + msg）与响应缺口
    private String failureOf(JSONObject response, String failurePrefix) {
        Integer code = response.getInt(KEY_CODE, null);
        if (code == null || code != CODE_SUCCESS) {
            return failurePrefix + code + " " + response.getStr(KEY_MSG, "");
        }
        return failurePrefix + "响应缺少轮换 token";
    }

    // app_id 数值化（§13.4 body 逐字：long 形态），非法返回 null 由调用方如实失败
    private Long appIdOf(String appId) {
        if (appId == null) {
            return null;
        }
        try {
            return Long.parseLong(appId);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
