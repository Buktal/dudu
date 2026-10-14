package com.dudu.duduserver.channel.qq;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.channel.support.TokenResult;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * QQ 纯文本发送（事实见 docs/research/channels/qq.md §5.8/§5.9/§6）：凭 channel_info 的
 * appId/appSecret 经 POST /app/getAppAccessToken 换取 access_token（进程内缓存复用，临期自动换新），再按访客身份的场景前缀路由 POST /v2/users/{openid}/messages 或
 * /v2/groups/{openid}/messages，报文 {content, msg_type:0}；成功以 err_code 缺省/0 为准，
 * 返回的 id 为渠道消息标识。报文不带 msg_id/msg_seq——按主动消息发送（被动回复需事件
 * msg_id，发送边界未携带；主动消息受官方频控约束，失败如实落库）。频道会话要求 WS 在线，
 * 本票未接入，如实失败。失败原样记录 err_code 与 message，网络与响应解析异常按调用失败
 * 如实返回。接口地址默认官方域名，可用 dudu.channel.qq.api-base 覆盖为受控替身。
 */
@Slf4j
@Component
public class QqTextSender {

    private static final String DEFAULT_API_BASE = "https://api.bot.qq.com";
    private static final String PATH_C2C_SEND = "/v2/users/{openid}/messages";
    private static final String PATH_GROUP_SEND = "/v2/groups/{openid}/messages";
    private static final int MSG_TYPE_TEXT = 0;
    private static final String KEY_MESSAGE_ID = "id";
    private static final String KEY_AUTHORIZATION = "Authorization";
    private static final String AUTHORIZATION_SCHEME = "QQBot ";

    private static final String GUILD_SEND_NOT_CONNECTED = "QQ 频道会话暂未接入发送（频道发送要求 WS 在线）";
    private static final String CONVERSATION_UNROUTABLE = "无法识别 QQ 会话场景，无法路由发送端点";

    private final RestClient restClient;

    private final QqAccessTokenClient accessTokenClient;

    public QqTextSender(RestClient.Builder builder,
                        @Value("${dudu.channel.qq.api-base:" + DEFAULT_API_BASE + "}") String apiBase) {
        this.restClient = builder.baseUrl(apiBase).build();
        this.accessTokenClient = new QqAccessTokenClient(restClient);
    }

    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        // 场景路由先于渠道调用：频道会话与无法路由的身份不发起任何请求
        QqProtocol.Conversation conversation = QqProtocol.conversation(externalUserId);
        if (conversation == null) {
            return ChannelSendResult.failed(CONVERSATION_UNROUTABLE);
        }
        if (QqProtocol.SCENE_GUILD.equals(conversation.scene())) {
            return ChannelSendResult.failed(GUILD_SEND_NOT_CONNECTED);
        }
        QqCredentials credentials = QqCredentials.of(account);
        try {
            TokenResult token = accessTokenClient.fetch(credentials);
            if (!token.succeeded()) {
                return ChannelSendResult.failed(token.failureReason());
            }
            JSONObject response = JSONUtil.parseObj(restClient.post()
                .uri(conversation.scene().equals(QqProtocol.SCENE_GROUP) ? PATH_GROUP_SEND : PATH_C2C_SEND,
                    conversation.id())
                .header(KEY_AUTHORIZATION, AUTHORIZATION_SCHEME + token.accessToken())
                .body(payload(text))
                .retrieve()
                .body(String.class));
            if (QqErrors.code(response) != 0) {
                return ChannelSendResult.failed("QQ消息发送失败：" + QqErrors.describe(response));
            }
            // 响应缺省时不冒充标识
            return ChannelSendResult.sent(response.getStr(KEY_MESSAGE_ID));
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应解析异常都按调用失败记录，不猜测发送结果
            log.warn("[qq] 消息发送失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelSendResult.failed("QQ接口调用失败：" + e.getMessage());
        }
    }

    // 文本报文：{content, msg_type:0}（官方 §5.8 请求体；不带 msg_id 即主动消息）
    private Map<String, Object> payload(String text) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("content", text);
        payload.put("msg_type", MSG_TYPE_TEXT);
        return payload;
    }
}
