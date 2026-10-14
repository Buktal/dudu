package com.dudu.duduserver.channel.dingtalk;

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
 * 钉钉工作通知纯文本发送（事实库 §5.9/§5.11 全文直抓）：先经新版凭证客户端换取
 * accessToken（进程内缓存复用，提前 200s 刷新），再 POST oapi 系 asyncsend_v2
 * （query access_token，body agent_id/userid_list/msg），成功以 errcode=0 为准，
 * task_id 作为渠道消息标识回传；失败原样记录 errcode 与 errmsg，网络与响应解析
 * 异常按调用失败如实返回。接口地址默认官方双域名，可用 dudu.channel.dingtalk.api-base
 * 与 dudu.channel.dingtalk.oapi-base 覆盖为受控替身。
 */
@Slf4j
@Component
public class DingtalkTextSender {

    // 新版凭证端点（api 系）
    static final String DEFAULT_API_BASE = "https://api.dingtalk.com";
    // 工作通知端点（oapi 系）
    static final String DEFAULT_OAPI_BASE = "https://oapi.dingtalk.com";
    private static final String PATH_ASYNC_SEND = "/topapi/message/corpconversation/asyncsend_v2";
    private static final String MSG_TYPE_TEXT = "text";

    private final RestClient oapiClient;
    private final DingtalkAccessTokenClient accessTokenClient;

    DingtalkTextSender(RestClient.Builder builder,
                       @Value("${dudu.channel.dingtalk.api-base:" + DEFAULT_API_BASE + "}") String apiBase,
                       @Value("${dudu.channel.dingtalk.oapi-base:" + DEFAULT_OAPI_BASE + "}") String oapiBase) {
        this.oapiClient = builder.baseUrl(oapiBase).build();
        this.accessTokenClient = new DingtalkAccessTokenClient(builder.clone().baseUrl(apiBase).build());
    }

    /**
     * 发送工作通知文本：userid_list 单接收人（官方 max 100，Desk 单发取 1）。
     *
     * @param account        渠道账号
     * @param externalUserId 钉钉用户标识（staffId/userId）
     * @param text           纯文本内容（官方 text content 最长 2048 字节）
     * @return 发送结果：task_id 或失败说明
     */
    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        DingtalkSendCredentials credentials = DingtalkSendCredentials.of(account);
        try {
            DingtalkAccessTokenClient.TokenResult token = accessTokenClient.fetch(credentials);
            if (!token.succeeded()) {
                return ChannelSendResult.failed(token.failureReason());
            }
            JSONObject response = JSONUtil.parseObj(oapiClient.post()
                .uri(PATH_ASYNC_SEND + "?access_token={token}", token.accessToken())
                .body(payload(credentials, externalUserId, text))
                .retrieve()
                .body(String.class));
            if (response.getInt("errcode", 0) != 0) {
                return ChannelSendResult.failed("钉钉工作通知发送失败：" + DingtalkErrors.describe(response));
            }
            return ChannelSendResult.sent(response.getStr("task_id"));
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应解析异常都按调用失败记录，不猜测发送结果
            log.warn("[dingtalk] 工作通知发送失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelSendResult.failed("钉钉接口调用失败：" + e.getMessage());
        }
    }

    // 工作通知报文：{agent_id, userid_list, msg:{msgtype, text:{content}}}（官方示例字段）
    private Map<String, Object> payload(DingtalkSendCredentials credentials, String externalUserId, String text) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("agent_id", credentials.agentId());
        payload.put("userid_list", externalUserId);
        payload.put("msg", Map.of("msgtype", MSG_TYPE_TEXT, "text", Map.of("content", text)));
        return payload;
    }
}
