package com.dudu.duduserver.channel.feishu;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.UUID;

/**
 * 飞书纯文本发送，事实见 docs/research/channels/feishu.md §5.10、§5.11、§6：先经
 * tenant_access_token/internal 换取（进程内缓存复用）接口凭据，再 POST
 * /open-apis/im/v1/messages?receive_id_type=open_id 下发 text 报文；content 为
 * JSON 序列化字符串，uuid 用随机 UUID 供渠道去重。成功以 code=0 为准并取
 * data.message_id 作渠道消息标识，渠道错误原样记录 code 与 msg，网络与响应解析
 * 异常按调用失败如实返回。接口地址默认官方域名，可用 dudu.channel.feishu.api-base
 * 覆盖为受控替身。
 */
@Slf4j
@Component
public class FeishuTextSender {

    private static final String DEFAULT_API_BASE = "https://open.feishu.cn";
    private static final String PATH_MESSAGES = "/open-apis/im/v1/messages";
    private static final String QUERY_RECEIVE_ID_TYPE = "receive_id_type=open_id";
    private static final String KEY_RECEIVE_ID = "receive_id";
    private static final String KEY_MSG_TYPE = "msg_type";
    private static final String KEY_CONTENT = "content";
    private static final String KEY_TEXT = "text";
    private static final String KEY_UUID = "uuid";
    private static final String KEY_DATA = "data";
    private static final String KEY_MESSAGE_ID = "message_id";
    private static final String MSG_TYPE_TEXT = "text";
    private static final String SEND_CREDENTIALS_MISSING = "渠道发送凭据未配置";
    private static final String BEARER_PREFIX = "Bearer ";

    private final RestClient restClient;

    private final FeishuTokenClient tokenClient;

    public FeishuTextSender(RestClient.Builder builder,
                             @Value("${dudu.channel.feishu.api-base:" + DEFAULT_API_BASE + "}") String apiBase) {
        this.restClient = builder.baseUrl(apiBase).build();
        // 与发送共用同一 RestClient 基址，便于测试替身与官方域名切换
        this.tokenClient = new FeishuTokenClient(restClient);
    }

    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        FeishuSendCredentials credentials = FeishuSendCredentials.of(account);
        if (credentials == null) {
            return ChannelSendResult.failed(SEND_CREDENTIALS_MISSING);
        }
        FeishuTokenClient.TokenResult token = tokenClient.fetch(credentials);
        if (!token.succeeded()) {
            return ChannelSendResult.failed(token.failureReason());
        }
        try {
            JSONObject response = JSONUtil.parseObj(restClient.post()
                .uri(PATH_MESSAGES + "?" + QUERY_RECEIVE_ID_TYPE)
                .header("Authorization", BEARER_PREFIX + token.accessToken())
                .body(payload(externalUserId, text))
                .retrieve()
                .body(String.class));
            if (FeishuErrors.code(response) != 0) {
                return ChannelSendResult.failed("飞书消息发送失败：" + FeishuErrors.describe(response));
            }
            JSONObject data = response.getJSONObject(KEY_DATA);
            String messageId = data == null ? null : data.getStr(KEY_MESSAGE_ID);
            if (messageId == null || messageId.isEmpty()) {
                return ChannelSendResult.failed("飞书消息发送失败：响应缺少 data.message_id");
            }
            return ChannelSendResult.sent(messageId);
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应解析异常都按调用失败记录，不猜测发送结果
            log.warn("[feishu] 消息发送失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelSendResult.failed("飞书接口调用失败：" + e.getMessage());
        }
    }

    // 发送报文：{receive_id, msg_type, content(JSON 字符串), uuid}（官方 §5.10 示例字段）
    private JSONObject payload(String externalUserId, String text) {
        return JSONUtil.createObj()
            .set(KEY_RECEIVE_ID, externalUserId)
            .set(KEY_MSG_TYPE, MSG_TYPE_TEXT)
            .set(KEY_CONTENT, JSONUtil.createObj().set(KEY_TEXT, text).toString())
            .set(KEY_UUID, UUID.randomUUID().toString());
    }
}
