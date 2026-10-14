package com.dudu.duduserver.channel.xiaohongshu;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import org.springframework.web.client.RestClient;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 小红书调用凭证换取（事实见 docs/research/channels/xiaohongshu.md §12.2）：POST
 * /api/rmp/token，body 以 JSON 写入 appid/secret；成功取 data.access_token。发送每次调用都
 * 换取一次（无进程内缓存），复用同一换取逻辑与同一份失败说明格式；渠道错误原样记录 code
 * 与 msg。官方文档注明错误响应 data 为空、正确响应也不保证非空，缺 token 如实按失败处理。
 */
class XiaohongshuAccessTokenClient {

    private static final String PATH_TOKEN = "/api/rmp/token";
    private static final String KEY_APP_ID = "appid";
    private static final String KEY_SECRET = "secret";
    private static final String KEY_DATA = "data";
    private static final String KEY_ACCESS_TOKEN = "access_token";

    private final RestClient restClient;

    XiaohongshuAccessTokenClient(RestClient restClient) {
        this.restClient = restClient;
    }

    // 换取结果：成功只带 access_token，失败只带已成型的原因说明
    record TokenResult(String accessToken, String failureReason) {

        boolean succeeded() {
            return accessToken != null;
        }
    }

    TokenResult fetch(XiaohongshuSendCredentials credentials) {
        if (credentials == null) {
            return new TokenResult(null, "获取小红书接口凭据失败：发送凭据未配置");
        }
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
        return new TokenResult(accessToken, null);
    }

    // DC010382 请求示例：{appid, secret}，JSON body（DC853803 通用约定 content-type JSON）
    private Map<String, Object> tokenPayload(XiaohongshuSendCredentials credentials) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put(KEY_APP_ID, credentials.appId());
        payload.put(KEY_SECRET, credentials.appSecret());
        return payload;
    }
}
