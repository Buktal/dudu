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
 * 小红书私信三方令牌刷新（事实见 docs/research/channels/xiaohongshu.md §13.4，
 * 4808/4945）：POST /api/open/oauth2/refresh_token，JSON body {app_id(long)、secret、
 * refresh_token}；响应 {code:0、success、msg、data{access_token、
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
    private static final String PATH_REFRESH = "/api/open/oauth2/refresh_token";

    // 请求 body 键（§13.4 逐字：app_id 为 long）
    private static final String KEY_APP_ID = "app_id";
    private static final String KEY_SECRET = "secret";
    private static final String KEY_REFRESH_TOKEN = "refresh_token";

    // 响应信封键（4945 示例逐字）
    private static final String KEY_CODE = "code";
    private static final String KEY_MSG = "msg";
    private static final String KEY_DATA = "data";
    private static final String KEY_ACCESS_TOKEN = "access_token";
    private static final String KEY_NEXT_REFRESH_TOKEN = "refresh_token";

    // refreshToken 缺失的如实说明：授权链路未完成，需运营走 ad-market 授权后录入
    static final String TOKEN_REFRESH_MISSING =
        "小红书私信三方令牌未完成授权：channel_info 缺少 refreshToken（需运营完成授权换取后录入）";

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
        long appId;
        try {
            appId = Long.parseLong(credentials.appId());
        } catch (NumberFormatException e) {
            return new TokenResult(null, "刷新小红书私信三方令牌失败：app_id 不是合法数值（" + credentials.appId() + "）");
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
            Integer code = response.getInt(KEY_CODE, null);
            if (code == null || code != 0) {
                return new TokenResult(null,
                    "刷新小红书私信三方令牌失败：" + code + " " + response.getStr(KEY_MSG, ""));
            }
            JSONObject data = response.getJSONObject(KEY_DATA);
            String accessToken = data == null ? null : data.getStr(KEY_ACCESS_TOKEN, null);
            String nextRefreshToken = data == null ? null : data.getStr(KEY_NEXT_REFRESH_TOKEN, null);
            if (accessToken == null || accessToken.isBlank() || nextRefreshToken == null || nextRefreshToken.isBlank()) {
                return new TokenResult(null, "刷新小红书私信三方令牌失败：响应缺少轮换 token");
            }
            // 先持久化再返回：旧 token 5 分钟后失效，轮换产物不落库则重启后失去续期能力
            store.store(account.getCompanyChannelId(), accessToken, nextRefreshToken);
            return new TokenResult(accessToken, null);
        } catch (RuntimeException e) {
            // 网络与 HTTP 状态异常按调用失败记录，store 回写失败同此路径，不猜测轮换结果
            return new TokenResult(null, "刷新小红书私信三方令牌失败：" + e.getMessage());
        }
    }
}
