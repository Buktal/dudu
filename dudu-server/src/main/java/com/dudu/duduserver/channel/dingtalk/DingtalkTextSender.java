package com.dudu.duduserver.channel.dingtalk;

import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * 钉钉工作通知文本发送（事实库 §5.9/§5.11）：oapi 系 asyncsend_v2，query 携带
 * access_token，agent_id 取发送侧凭据；task_id 作为渠道消息标识回传。实现细节由
 * 凭证客户端与错误说明类协作，测试以本地替身按官方事实构造响应。
 */
@Component
public class DingtalkTextSender {

    // 新版凭证端点（api 系）：POST /v1.0/oauth2/accessToken
    static final String DEFAULT_API_BASE = "https://api.dingtalk.com";
    // 工作通知端点（oapi 系）：POST /topapi/message/corpconversation/asyncsend_v2
    static final String DEFAULT_OAPI_BASE = "https://oapi.dingtalk.com";

    private final RestClient restClient;
    private final String apiBase;
    private final String oapiBase;

    DingtalkTextSender(RestClient.Builder builder,
                       @Value("${dudu.channel.dingtalk.api-base:" + DEFAULT_API_BASE + "}") String apiBase,
                       @Value("${dudu.channel.dingtalk.oapi-base:" + DEFAULT_OAPI_BASE + "}") String oapiBase) {
        this.restClient = builder.build();
        this.apiBase = apiBase;
        this.oapiBase = oapiBase;
    }

    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        throw new UnsupportedOperationException("尚未实现");
    }
}
