package com.dudu.duduserver.channel.xiaohongshu;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.channel.support.ChannelRestrictions;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 小红书纯文本主动回复（发送客服消息），事实见 docs/research/channels/xiaohongshu.md
 * §12.1、§12.2、§12.5：收到客服消息后 48h 窗口内经 POST /api/rmp/message/custom 主动下发；
 * 先用 channel_info 的 appId/appSecret 经 /api/rmp/token 换取 access_token（进程内缓存复用，临期自动换新），再下发 msg_type=text 的 content。公共参数 app_id/access_token
 * 官方未明示携带位置，按微信族惯例走 query（若有出入只需调整调用处一处拼接，§12.1 待
 * 核验）；成功以 success=true 且 code=0 为准，接口不返回消息标识；失败原样记录 code 与
 * msg，网络与响应解析异常按调用失败如实返回。接口地址默认官方域名，可用
 * dudu.channel.xiaohongshu.api-base 覆盖为受控替身。
 */
@Slf4j
@Component
public class XiaohongshuTextSender {

    static final String DEFAULT_API_BASE = "https://miniapp.xiaohongshu.com";
    private static final String PATH_CUSTOM_SEND = "/api/rmp/message/custom";
    private static final String MSG_TYPE_TEXT = "text";
    private final RestClient restClient;

    private final XiaohongshuAccessTokenClient accessTokenClient;

    public XiaohongshuTextSender(RestClient.Builder builder,
                                 @Value("${dudu.channel.xiaohongshu.api-base:" + DEFAULT_API_BASE + "}") String apiBase) {
        this.restClient = builder.baseUrl(apiBase).build();
        this.accessTokenClient = new XiaohongshuAccessTokenClient(restClient);
    }

    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        XiaohongshuSendCredentials credentials = XiaohongshuSendCredentials.of(account);
        if (credentials == null) {
            return ChannelSendResult.failed(ChannelRestrictions.SEND_CREDENTIALS_MISSING);
        }
        try {
            XiaohongshuAccessTokenClient.TokenResult token = accessTokenClient.fetch(credentials);
            if (!token.succeeded()) {
                return ChannelSendResult.failed(token.failureReason());
            }
            JSONObject response = JSONUtil.parseObj(restClient.post()
                .uri(PATH_CUSTOM_SEND + "?app_id={appId}&access_token={token}",
                    credentials.appId(), token.accessToken())
                .body(payload(externalUserId, text))
                .retrieve()
                .body(String.class));
            if (!XiaohongshuErrors.succeeded(response)) {
                return ChannelSendResult.failed("小红书客服消息发送失败：" + XiaohongshuErrors.describe(response));
            }
            return ChannelSendResult.sent(null);
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应解析异常都按调用失败记录，不猜测发送结果
            log.warn("[xiaohongshu] 客服消息发送失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelSendResult.failed("小红书接口调用失败：" + e.getMessage());
        }
    }

    // DC234367 业务报文：{openid, msg_type, content}；公共参数见类注释走 query
    private Map<String, Object> payload(String externalUserId, String text) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("openid", externalUserId);
        payload.put("msg_type", MSG_TYPE_TEXT);
        payload.put("content", text);
        return payload;
    }
}
