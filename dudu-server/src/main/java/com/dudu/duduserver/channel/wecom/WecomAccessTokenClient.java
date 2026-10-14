package com.dudu.duduserver.channel.wecom;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import org.springframework.web.client.RestClient;

/**
 * 企业微信 access_token 换取（事实见 docs/research/channels/wecom.md §6/91039）：用
 * channel_info 的 corpId/corpSecret 请求 GET /cgi-bin/gettoken。发送与素材读取各自每次
 * 调用都换取一次（access_token 有效期 7200 秒、每应用独立、须缓存复用，频繁调用会被
 * 频率拦截——当前调用量低，不做进程内缓存，与公众号先例一致）；渠道错误原样记录
 * errcode 与 errmsg。
 */
class WecomAccessTokenClient {

    private static final String PATH_GETTOKEN = "/cgi-bin/gettoken";
    private static final String KEY_ACCESS_TOKEN = "access_token";

    private final RestClient restClient;

    WecomAccessTokenClient(RestClient restClient) {
        this.restClient = restClient;
    }

    // 换取结果：成功只带 access_token，失败只带已成型的原因说明
    record TokenResult(String accessToken, String failureReason) {

        boolean succeeded() {
            return accessToken != null;
        }
    }

    TokenResult fetch(WecomCredentials credentials) {
        JSONObject response = JSONUtil.parseObj(restClient.get()
            .uri(PATH_GETTOKEN + "?corpid={corpid}&corpsecret={corpsecret}",
                credentials.corpId(), credentials.corpSecret())
            .retrieve()
            .body(String.class));
        if (WecomErrors.code(response) != 0) {
            return new TokenResult(null, "获取企业微信接口凭据失败：" + WecomErrors.describe(response));
        }
        String accessToken = response.getStr(KEY_ACCESS_TOKEN);
        if (accessToken == null || accessToken.isEmpty()) {
            return new TokenResult(null, "获取企业微信接口凭据失败：响应缺少 access_token");
        }
        return new TokenResult(accessToken, null);
    }
}
