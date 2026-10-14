package com.dudu.duduserver.channel.wechatmini;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.channel.support.Errcodes;
import com.dudu.duduserver.channel.support.TokenResult;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 小程序纯文本主动回复（客服消息），事实见 docs/research/channels/wechat-mini.md §6.2、§3.6：
 * 小程序无被动回复，经 /cgi-bin/message/custom/send 主动下发；先用 channel_info 的
 * appId/appSecret 经 /cgi-bin/token 换取 access_token（进程内缓存复用，临期自动换新），
 * 再 POST text 报文；成功以 errcode=0 为准（客服消息接口不返回消息标识），失败原样记录
 * errcode 与 errmsg，网络与响应解析异常按调用失败如实返回。接口地址默认官方域名，可用
 * dudu.channel.wechat-mini.api-base 覆盖为受控替身。
 */
@Slf4j
@Component
public class WechatMiniTextSender {

    private static final String DEFAULT_API_BASE = "https://api.weixin.qq.com";
    private static final String PATH_CUSTOM_SEND = "/cgi-bin/message/custom/send";
    private static final String MSG_TYPE_TEXT = "text";

    private final RestClient restClient;

    private final WechatMiniAccessTokenClient accessTokenClient;

    public WechatMiniTextSender(RestClient.Builder builder,
                                @Value("${dudu.channel.wechat-mini.api-base:" + DEFAULT_API_BASE + "}") String apiBase) {
        this.restClient = builder.baseUrl(apiBase).build();
        this.accessTokenClient = new WechatMiniAccessTokenClient(restClient);
    }

    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        WechatMiniCredentials credentials = WechatMiniCredentials.of(account);
        try {
            TokenResult token = accessTokenClient.fetch(credentials);
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
            log.warn("[wechat-mini] 客服消息发送失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
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
