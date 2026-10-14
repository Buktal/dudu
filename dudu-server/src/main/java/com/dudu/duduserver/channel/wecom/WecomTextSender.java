package com.dudu.duduserver.channel.wecom;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 企业微信纯文本发送（应用消息 text，事实见 docs/research/channels/wecom.md §2 出站补证
 * /90236）：先用 channel_info 的 corpId/corpSecret 经 /cgi-bin/gettoken 换取 access_token
 * （进程内缓存复用，临期自动换新），再 POST /cgi-bin/message/send 下发
 * {touser, msgtype:text, agentid, text:{content}}；成功以 errcode=0 为准，msgid 为渠道
 * 消息标识（用于撤回）；部分接收人无效时仍按 errcode 判断。失败原样记录 errcode 与
 * errmsg，网络与响应解析异常按调用失败如实返回。接口地址默认官方域名，可用
 * dudu.channel.wecom.api-base 覆盖为受控替身。
 */
@Slf4j
@Component
public class WecomTextSender {

    private static final String DEFAULT_API_BASE = "https://qyapi.weixin.qq.com";
    private static final String PATH_MESSAGE_SEND = "/cgi-bin/message/send";
    private static final String MSG_TYPE_TEXT = "text";
    private static final String KEY_MSG_ID = "msgid";

    private final RestClient restClient;

    private final WecomAccessTokenClient accessTokenClient;

    public WecomTextSender(RestClient.Builder builder,
                           @Value("${dudu.channel.wecom.api-base:" + DEFAULT_API_BASE + "}") String apiBase) {
        this.restClient = builder.baseUrl(apiBase).build();
        this.accessTokenClient = new WecomAccessTokenClient(restClient);
    }

    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        WecomCredentials credentials = WecomCredentials.of(account);
        try {
            WecomAccessTokenClient.TokenResult token = accessTokenClient.fetch(credentials);
            if (!token.succeeded()) {
                return ChannelSendResult.failed(token.failureReason());
            }
            JSONObject response = JSONUtil.parseObj(restClient.post()
                .uri(PATH_MESSAGE_SEND + "?access_token={token}", token.accessToken())
                .body(payload(credentials.agentId(), externalUserId, text))
                .retrieve()
                .body(String.class));
            if (WecomErrors.code(response) != 0) {
                return ChannelSendResult.failed("企业微信应用消息发送失败：" + WecomErrors.describe(response));
            }
            // msgid 用于撤回应用消息（90236）；响应缺省时不冒充标识
            return ChannelSendResult.sent(response.getStr(KEY_MSG_ID));
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应解析异常都按调用失败记录，不猜测发送结果
            log.warn("[wecom] 应用消息发送失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelSendResult.failed("企业微信接口调用失败：" + e.getMessage());
        }
    }

    // 应用消息 text 报文：{touser, msgtype, agentid, text:{content}}（官方 90236 请求示例字段）
    private Map<String, Object> payload(String agentId, String externalUserId, String text) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("touser", externalUserId);
        payload.put("msgtype", MSG_TYPE_TEXT);
        payload.put("agentid", agentId);
        payload.put("text", Map.of("content", text));
        return payload;
    }
}
