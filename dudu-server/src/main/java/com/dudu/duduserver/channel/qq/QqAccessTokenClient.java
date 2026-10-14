package com.dudu.duduserver.channel.qq;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * QQ access_token 换取（事实见 docs/research/channels/qq.md §5.10/§6）：用 channel_info
 * 的 appId/appSecret 请求 POST /app/getAppAccessToken（body 字段 appId/clientSecret）。
 * 发送每次调用都换取一次（默认 7200 秒、临期 60 秒内获取发新值，当前调用量低，不做进程内
 * 缓存，与公众号/企业微信先例一致）。失败响应是 {code, message} 且 HTTP 恒 200，官方明确
 * 依据 code 判断——与 OpenAPI 业务失败体 {err_code,...} 字段名不同；expires_in 表格口径
 * number、示例为字符串，解析不做依赖。
 */
class QqAccessTokenClient {

    private static final String PATH_TOKEN = "/app/getAppAccessToken";
    private static final String KEY_ACCESS_TOKEN = "access_token";
    private static final String KEY_CODE = "code";
    private static final String KEY_MESSAGE = "message";
    private static final String SUCCESS_CODE = "0";

    private final RestClient restClient;

    QqAccessTokenClient(RestClient restClient) {
        this.restClient = restClient;
    }

    // 换取结果：成功只带 access_token，失败只带已成型的原因说明
    record TokenResult(String accessToken, String failureReason) {

        boolean succeeded() {
            return accessToken != null;
        }
    }

    TokenResult fetch(QqCredentials credentials) {
        JSONObject response = JSONUtil.parseObj(restClient.post()
            .uri(PATH_TOKEN)
            .body(Map.of("appId", credentials.appId(), "clientSecret", credentials.appSecret()))
            .retrieve()
            .body(String.class));
        // 官方口径：业务失败通过 code 判断（不要通过 HTTP 状态码，也不要通过 message）
        String code = response.getStr(KEY_CODE);
        if (code != null && !code.isEmpty() && !SUCCESS_CODE.equals(code)) {
            return new TokenResult(null, "获取QQ接口凭据失败：" + code + " " + response.getStr(KEY_MESSAGE, ""));
        }
        String accessToken = response.getStr(KEY_ACCESS_TOKEN);
        if (accessToken == null || accessToken.isEmpty()) {
            return new TokenResult(null, "获取QQ接口凭据失败：响应缺少 access_token");
        }
        return new TokenResult(accessToken, null);
    }
}
