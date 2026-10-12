package com.dudu.duduserver.channel;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 微信公众号纯文本发送（客服消息），事实见 docs/research/channels/wechat-mp.md：
 * 先用 channel_info 的 appId/appSecret 经 /cgi-bin/token 换取 access_token（每次发送
 * 都取一次，不做进程内缓存），再 POST /cgi-bin/message/custom/send 下发 text 报文；
 * 成功以 errcode=0 为准（客服消息接口不返回消息标识），失败原样记录 errcode 与 errmsg，
 * 网络与响应解析异常按调用失败如实返回。接口地址默认官方域名，可用
 * dudu.channel.wechat.api-base 覆盖为受控替身。
 */
@Slf4j
@Component
public class WechatMpTextSender implements ChannelOutboundSender {

    private static final String DEFAULT_API_BASE = "https://api.weixin.qq.com";
    private static final String PATH_CUSTOM_SEND = "/cgi-bin/message/custom/send";
    private static final String MSG_TYPE_TEXT = "text";

    private final RestClient restClient;

    private final WechatMpAccessTokenClient accessTokenClient;

    public WechatMpTextSender(RestClient.Builder builder,
                              @Value("${dudu.channel.wechat.api-base:" + DEFAULT_API_BASE + "}") String apiBase) {
        this.restClient = builder.baseUrl(apiBase).build();
        this.accessTokenClient = new WechatMpAccessTokenClient(restClient);
    }

    @Override
    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        String restriction = ChannelSendCapabilities.sendRestriction(account);
        if (restriction != null) {
            return ChannelSendResult.failed(restriction);
        }
        WechatMpCredentials credentials = WechatMpCredentials.of(account);
        try {
            WechatMpAccessTokenClient.TokenResult token = accessTokenClient.fetch(credentials);
            if (!token.succeeded()) {
                return ChannelSendResult.failed(token.failureReason());
            }
            JSONObject response = JSONUtil.parseObj(restClient.post()
                .uri(PATH_CUSTOM_SEND + "?access_token={token}", token.accessToken())
                .body(payload(externalUserId, text))
                .retrieve()
                .body(String.class));
            if (WechatMpErrors.code(response) != 0) {
                return ChannelSendResult.failed("微信客服消息发送失败：" + WechatMpErrors.describe(response));
            }
            return ChannelSendResult.sent(null);
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应解析异常都按调用失败记录，不猜测发送结果
            log.warn("[wechat-mp] 客服消息发送失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelSendResult.failed("微信接口调用失败：" + e.getMessage());
        }
    }

    // 客服消息文本报文：{touser, msgtype, text:{content}}（官方示例字段）
    private Map<String, Object> payload(String externalUserId, String text) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("touser", externalUserId);
        payload.put("msgtype", MSG_TYPE_TEXT);
        payload.put("text", Map.of("content", text));
        return payload;
    }
}
