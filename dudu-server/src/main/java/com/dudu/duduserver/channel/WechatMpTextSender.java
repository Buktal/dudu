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
    private static final String PATH_TOKEN = "/cgi-bin/token";
    private static final String PATH_CUSTOM_SEND = "/cgi-bin/message/custom/send";
    private static final String GRANT_TYPE_CLIENT_CREDENTIAL = "client_credential";
    private static final String MSG_TYPE_TEXT = "text";
    private static final String KEY_ACCESS_TOKEN = "access_token";
    private static final String KEY_ERROR_CODE = "errcode";
    private static final String KEY_ERROR_MSG = "errmsg";

    private final RestClient restClient;

    public WechatMpTextSender(RestClient.Builder builder,
                              @Value("${dudu.channel.wechat.api-base:" + DEFAULT_API_BASE + "}") String apiBase) {
        this.restClient = builder.baseUrl(apiBase).build();
    }

    @Override
    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        String restriction = ChannelSendCapabilities.sendRestriction(account);
        if (restriction != null) {
            return ChannelSendResult.failed(restriction);
        }
        WechatMpSendCredentials credentials = WechatMpSendCredentials.of(account);
        try {
            JSONObject tokenResponse = JSONUtil.parseObj(restClient.get()
                .uri(PATH_TOKEN + "?grant_type=" + GRANT_TYPE_CLIENT_CREDENTIAL + "&appid={appid}&secret={secret}",
                    credentials.appId(), credentials.appSecret())
                .retrieve()
                .body(String.class));
            if (errorCode(tokenResponse) != 0) {
                return ChannelSendResult.failed("获取微信接口凭据失败：" + error(tokenResponse));
            }
            String accessToken = tokenResponse.getStr(KEY_ACCESS_TOKEN);
            if (accessToken == null || accessToken.isEmpty()) {
                return ChannelSendResult.failed("获取微信接口凭据失败：响应缺少 access_token");
            }
            JSONObject response = JSONUtil.parseObj(restClient.post()
                .uri(PATH_CUSTOM_SEND + "?access_token={token}", accessToken)
                .body(payload(externalUserId, text))
                .retrieve()
                .body(String.class));
            if (errorCode(response) != 0) {
                return ChannelSendResult.failed("微信客服消息发送失败：" + error(response));
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

    private int errorCode(JSONObject response) {
        Integer code = response.getInt(KEY_ERROR_CODE, 0);
        return code == null ? 0 : code;
    }

    // 渠道原始说明：errcode + errmsg；缺少时如实说明响应无法识别
    private String error(JSONObject response) {
        Integer code = response.getInt(KEY_ERROR_CODE);
        String message = response.getStr(KEY_ERROR_MSG);
        if (code == null && message == null) {
            return "响应无法识别";
        }
        return code + " " + (message == null ? "" : message);
    }
}
