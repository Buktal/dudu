package com.dudu.duduserver.channel.support;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelSendResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.client.RestClient;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Function;

/**
 * 微信族纯文本发送骨架（客服消息）：公众号与小程序同 URL 同协议（docs/research/channels/
 * wechat-mp.md §2.7、§6 与 wechat-mini.md §6.2，同一 POST /cgi-bin/message/custom/send）；
 * wecom 为真分叉（/cgi-bin/message/send、应用消息报文与 msgid）不在此列。渠道薄层以
 * api-base、日志标签与凭据取值参数化。先经 WechatTokenClient 换取 access_token（进程内
 * 按凭据组缓存复用），再下发 text 报文；成功以 errcode=0 为准（客服消息接口不返回消息
 * 标识），失败原样记录 errcode 与 errmsg，网络与响应解析异常按调用失败如实返回。实例由
 * 渠道薄层按用途各建各的，与素材读取互不共享令牌缓存（口径见 AccessTokenCache）。
 */
@Slf4j
public final class WechatTextSender<C> {

    private static final String PATH_CUSTOM_SEND = "/cgi-bin/message/custom/send";
    private static final String MSG_TYPE_TEXT = "text";

    private final RestClient restClient;

    private final WechatTokenClient<C> tokenClient;

    // 日志标签：渠道薄层给定（"wechat-mp"/"wechat-mini"），日志口径与渠道前缀一致
    private final String logTag;

    public WechatTextSender(RestClient.Builder builder, String apiBase, String logTag,
                            Function<C, String> appIdOf, Function<C, String> appSecretOf) {
        this.restClient = builder.baseUrl(apiBase).build();
        this.tokenClient = new WechatTokenClient<>(restClient, appIdOf, appSecretOf);
        this.logTag = logTag;
    }

    public ChannelSendResult send(C credentials, Long companyChannelId, String externalUserId, String text) {
        try {
            TokenResult token = tokenClient.fetch(credentials);
            if (!token.succeeded()) {
                return ChannelSendResult.failed(token.failureReason());
            }
            JSONObject response = JSONUtil.parseObj(restClient.post()
                .uri(PATH_CUSTOM_SEND + "?access_token={token}", token.accessToken())
                .body(payload(externalUserId, text))
                .retrieve()
                .body(String.class));
            if (Errcodes.code(response) != 0) {
                return ChannelSendResult.failed("微信客服消息发送失败：" + Errcodes.describe(response));
            }
            return ChannelSendResult.sent(null);
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应解析异常都按调用失败记录，不猜测发送结果
            log.warn("[{}] 客服消息发送失败, companyChannelId={}, exception={}",
                logTag, companyChannelId, e.getClass().getSimpleName());
            return ChannelSendResult.failed("微信接口调用失败：" + e.getMessage());
        }
    }

    // 客服消息文本报文：{touser, msgtype, text:{content}}（官方示例字段，touser 为用户 OpenID）
    private Map<String, Object> payload(String externalUserId, String text) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("touser", externalUserId);
        payload.put("msgtype", MSG_TYPE_TEXT);
        payload.put("text", Map.of("content", text));
        return payload;
    }
}
