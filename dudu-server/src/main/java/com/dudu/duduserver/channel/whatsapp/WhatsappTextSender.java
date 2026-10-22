package com.dudu.duduserver.channel.whatsapp;

import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * WhatsApp 纯文本发送（事实见 docs/research/channels/whatsapp.md §5.3/§6）：凭
 * channel_info 的 accessToken/phoneNumberId 经 POST /{version}/{phone_number_id}/messages
 * 下发 {messaging_product:"whatsapp", recipient_type:"individual", to, type:"text",
 * text:{body}}，Authorization: Bearer 系统用户令牌；响应只代表 API 已受理（messages[0].id
 * 即 wamid），投递经 status webhook 异步到达。text.body 官方上限 4096 字符，超限由渠道
 * 拒绝后如实落库，不本地截断。失败原样记录渠道 error（code/message/error_data.details），
 * 网络与响应解析异常按调用失败如实返回。接口地址默认官方域名，可用
 * dudu.channel.whatsapp.api-base 覆盖为受控替身；版本段锚定事实库官方示例 v23.0
 * （路径语义不随版本变化）。
 */
@Slf4j
@Component
public class WhatsappTextSender {

    private static final String DEFAULT_API_BASE = "https://graph.facebook.com";
    private static final String PATH_SEND = "/" + WhatsappErrors.API_VERSION + "/{phoneNumberId}/messages";
    private static final String KEY_AUTHORIZATION = "Authorization";
    private static final String AUTHORIZATION_SCHEME = "Bearer ";
    private static final String KEY_MESSAGES = "messages";
    private static final String KEY_ID = "id";

    private final RestClient restClient;

    public WhatsappTextSender(RestClient.Builder builder,
                              @Value("${dudu.channel.whatsapp.api-base:" + DEFAULT_API_BASE + "}") String apiBase) {
        this.restClient = builder.baseUrl(apiBase).build();
    }

    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        WhatsappSendCredentials credentials = WhatsappSendCredentials.of(account);
        try {
            String responseBody = restClient.post()
                .uri(PATH_SEND, credentials.phoneNumberId())
                .header(KEY_AUTHORIZATION, AUTHORIZATION_SCHEME + credentials.accessToken())
                .body(payload(externalUserId, text))
                .retrieve()
                .body(String.class);
            JSONObject response = JSONUtil.parseObj(responseBody);
            // 受理响应携带 wamid（messages[0].id，与 statuses[].id 三处同源）；缺省不冒充标识
            JSONArray messages = response.getJSONArray(KEY_MESSAGES);
            String wamid = messages == null || messages.isEmpty() || !(messages.get(0) instanceof JSONObject message)
                ? null
                : message.getStr(KEY_ID);
            return ChannelSendResult.sent(wamid);
        } catch (RestClientResponseException e) {
            // 渠道拒绝（HTTP 非 2xx）按渠道原始 error 说明落库
            String reason = WhatsappErrors.channelReason(e);
            log.warn("[whatsapp] 消息发送被渠道拒绝, companyChannelId={}, reason={}",
                account.getCompanyChannelId(), reason);
            return ChannelSendResult.failed("WhatsApp消息发送失败：" + reason);
        } catch (RuntimeException e) {
            // 网络、响应解析异常都按调用失败记录，不猜测发送结果
            log.warn("[whatsapp] 消息发送失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelSendResult.failed("WhatsApp接口调用失败：" + e.getMessage());
        }
    }

    // 文本报文（官方 §5.3 逐字字段）：to 为用户号码（E.164），text.body 即正文
    private Map<String, Object> payload(String externalUserId, String text) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("messaging_product", "whatsapp");
        payload.put("recipient_type", "individual");
        payload.put("to", externalUserId);
        payload.put("type", "text");
        payload.put("text", Map.of("body", text));
        return payload;
    }
}
