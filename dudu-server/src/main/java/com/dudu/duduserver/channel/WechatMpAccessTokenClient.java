package com.dudu.duduserver.channel;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import org.springframework.web.client.RestClient;

/**
 * 公众号 access_token 换取（事实见 docs/research/channels/wechat-mp.md §6）：用 channel_info
 * 的 appId/appSecret 请求 /cgi-bin/token。发送与素材读取各自每次调用都换取一次（无进程内
 * 缓存），复用同一换取逻辑与同一份失败说明格式；渠道错误原样记录 errcode 与 errmsg。
 */
class WechatMpAccessTokenClient {

    private static final String PATH_TOKEN = "/cgi-bin/token";
    private static final String GRANT_TYPE_CLIENT_CREDENTIAL = "client_credential";
    private static final String KEY_ACCESS_TOKEN = "access_token";

    private final RestClient restClient;

    WechatMpAccessTokenClient(RestClient restClient) {
        this.restClient = restClient;
    }

    // 换取结果：成功只带 access_token，失败只带已成型的原因说明
    record TokenResult(String accessToken, String failureReason) {

        boolean succeeded() {
            return accessToken != null;
        }
    }

    TokenResult fetch(WechatMpCredentials credentials) {
        JSONObject response = JSONUtil.parseObj(restClient.get()
            .uri(PATH_TOKEN + "?grant_type=" + GRANT_TYPE_CLIENT_CREDENTIAL + "&appid={appid}&secret={secret}",
                credentials.appId(), credentials.appSecret())
            .retrieve()
            .body(String.class));
        if (WechatMpErrors.code(response) != 0) {
            return new TokenResult(null, "获取微信接口凭据失败：" + WechatMpErrors.describe(response));
        }
        String accessToken = response.getStr(KEY_ACCESS_TOKEN);
        if (accessToken == null || accessToken.isEmpty()) {
            return new TokenResult(null, "获取微信接口凭据失败：响应缺少 access_token");
        }
        return new TokenResult(accessToken, null);
    }
}
