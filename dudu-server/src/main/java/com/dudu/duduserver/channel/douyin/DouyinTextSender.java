package com.dudu.duduserver.channel.douyin;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.channel.support.Texts;
import com.dudu.duduserver.channel.support.TokenResult;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * 抖音纯文本发送，事实见 docs/research/channels/douyin.md §6.1：场景一回复——先取
 * 访客最近一封来信的回复三要素（msg_id/conversation_id/发送方 open_id），再以
 * refreshToken 续期 access_token（进程内缓存复用）后 POST /im/send/msg/?open_id=
 * <发送方 open_id>（路径尾斜杠为官方要求），Header access-token，body 携带
 * scene=im_reply_msg、msg_id、conversation_id、to_user_id 与 content.msg_type=1
 * 文本报文。成功以 data.error_code=0 为准并取响应 msg_id 作渠道消息标识；回复
 * 上下文缺失、未完成用户授权与渠道错误如实失败不冒成功。
 * 接口地址默认官方域名，可用 dudu.channel.douyin.api-base 覆盖为受控替身。
 */
@Slf4j
@Component
public class DouyinTextSender {

    private static final String DEFAULT_API_BASE = "https://open.douyin.com";
    private static final String PATH_SEND_MSG = "/im/send/msg/";
    private static final String QUERY_OPEN_ID = "open_id=";
    private static final String HEADER_ACCESS_TOKEN = "access-token";

    // 场景一回复报文字段（官方 §6.1）
    private static final String KEY_SCENE = "scene";
    private static final String KEY_MSG_ID = "msg_id";
    private static final String KEY_CONVERSATION_ID = "conversation_id";
    private static final String KEY_TO_USER_ID = "to_user_id";
    private static final String KEY_CONTENT = "content";
    private static final String KEY_MSG_TYPE = "msg_type";
    private static final String KEY_TEXT = "text";
    private static final String SCENE_REPLY = "im_reply_msg";
    private static final int MSG_TYPE_TEXT = 1;

    private static final String KEY_DATA = "data";
    private static final String KEY_ERROR_CODE = "error_code";
    private static final String KEY_DESCRIPTION = "description";
    private static final String REPLY_CONTEXT_MISSING =
        "抖音消息发送失败：缺少可回复的来信（抖音仅支持回复场景，需访客 24 小时内来信）";

    private final RestClient restClient;

    private final DouyinTokenClient tokenClient;

    private final DouyinReplyContext replyContext;

    public DouyinTextSender(RestClient.Builder builder,
                            @Value("${dudu.channel.douyin.api-base:" + DEFAULT_API_BASE + "}") String apiBase,
                            DouyinReplyContext replyContext) {
        this.restClient = builder.baseUrl(apiBase).build();
        // 与发送共用同一 RestClient 基址，便于测试替身与官方域名切换
        this.tokenClient = new DouyinTokenClient(restClient);
        this.replyContext = replyContext;
    }

    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        DouyinCredentials credentials = DouyinCredentials.of(account);
        DouyinReplyContext.Reply reply = replyContext.lookup(account.getCompanyChannelId(), externalUserId);
        if (reply == null || Texts.isBlank(reply.msgId()) || Texts.isBlank(reply.conversationId())
            || Texts.isBlank(reply.ownerOpenId())) {
            return ChannelSendResult.failed(REPLY_CONTEXT_MISSING);
        }
        TokenResult token = tokenClient.fetch(credentials);
        if (!token.succeeded()) {
            return ChannelSendResult.failed(token.failureReason());
        }
        try {
            JSONObject response = JSONUtil.parseObj(restClient.post()
                .uri(PATH_SEND_MSG + "?" + QUERY_OPEN_ID + reply.ownerOpenId())
                .header(HEADER_ACCESS_TOKEN, token.accessToken())
                .contentType(MediaType.APPLICATION_JSON)
                .body(payload(reply, externalUserId, text))
                .retrieve()
                .body(String.class));
            JSONObject data = response.getJSONObject(KEY_DATA);
            Object errorCode = data == null ? null : data.get(KEY_ERROR_CODE);
            if (!(errorCode instanceof Number number) || number.longValue() != 0) {
                return ChannelSendResult.failed("抖音消息发送失败：" + describe(errorCode, response));
            }
            String messageId = response.getStr(KEY_MSG_ID, null);
            if (messageId == null || messageId.isBlank()) {
                return ChannelSendResult.failed("抖音消息发送失败：响应缺少 msg_id");
            }
            return ChannelSendResult.sent(messageId);
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应解析异常都按调用失败记录，不猜测发送结果
            log.warn("[douyin] 消息发送失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelSendResult.failed("抖音接口调用失败：" + e.getMessage());
        }
    }

    // 场景一报文：{scene, msg_id, conversation_id, to_user_id, content:{msg_type:1, text:{text}}}
    private JSONObject payload(DouyinReplyContext.Reply reply, String toUserId, String text) {
        return JSONUtil.createObj()
            .set(KEY_SCENE, SCENE_REPLY)
            .set(KEY_MSG_ID, reply.msgId())
            .set(KEY_CONVERSATION_ID, reply.conversationId())
            .set(KEY_TO_USER_ID, toUserId)
            .set(KEY_CONTENT, JSONUtil.createObj()
                .set(KEY_MSG_TYPE, MSG_TYPE_TEXT)
                .set(KEY_TEXT, JSONUtil.createObj().set(KEY_TEXT, text)));
    }

    // 渠道错误描述：优先 data.description，补顶层 description/message
    private String describe(Object errorCode, JSONObject response) {
        JSONObject data = response.getJSONObject(KEY_DATA);
        String description = data == null ? null : data.getStr(KEY_DESCRIPTION, null);
        if (Texts.isBlank(description)) {
            description = response.getStr(KEY_DESCRIPTION, response.getStr("message", null));
        }
        return errorCode + (Texts.isBlank(description) ? "" : " " + description);
    }

}
