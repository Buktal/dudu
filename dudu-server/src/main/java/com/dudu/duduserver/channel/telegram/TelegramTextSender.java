package com.dudu.duduserver.channel.telegram;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.channel.support.ChannelRestrictions;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClient;

/**
 * Telegram 纯文本发送（事实见 docs/research/channels/telegram.md §5.1、§5.3、§6）：POST
 * {@code <bot 基址>/sendMessage}——channel_info 的 url 为含 {@code /bot<token>} 路径段的
 * Bot API 基址（官方 §5.4 请求基式 {@code https://api.telegram.org/bot<token>/METHOD}，
 * token 走 URL 路径鉴权，两凭据键与 mock-pulse config.rs Telegram 变体一致），报文
 * {@code chat_id + text}（chat_id 数字形态按官方样本下发，非数字原样字符串）。成功以
 * 2XY 且 ok=true 为准并取 result.message_id 作渠道消息标识；失败包络
 * {@code ok:false + error_code/description/parameters.retry_after}（§5.3 + #responseparameters，
 * 频控三档超限回 429）、非包络响应与网络异常一律如实失败不模拟成功。token 在 URL 路径
 * 上，异常消息不含原始地址，凭据不写日志也不返回 Desk。
 */
@Slf4j
@Component
public class TelegramTextSender {

    private static final String PATH_SEND_MESSAGE = "/sendMessage";

    private static final String PARAM_CHAT_ID = "chat_id";
    private static final String PARAM_TEXT = "text";

    // 官方请求/响应包络键（§5.3 + #making-requests 逐字）
    private static final String KEY_OK = "ok";
    private static final String KEY_RESULT = "result";
    private static final String KEY_MESSAGE_ID = "message_id";
    private static final String KEY_ERROR_CODE = "error_code";
    private static final String KEY_DESCRIPTION = "description";
    private static final String KEY_PARAMETERS = "parameters";
    private static final String KEY_RETRY_AFTER = "retry_after";

    private final RestClient restClient;

    public TelegramTextSender(RestClient.Builder builder) {
        this.restClient = builder.build();
    }

    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        TelegramSendCredentials credentials = TelegramSendCredentials.of(account);
        if (credentials == null) {
            return ChannelSendResult.failed(ChannelRestrictions.SEND_CREDENTIALS_MISSING);
        }
        JSONObject request = new JSONObject();
        request.set(PARAM_CHAT_ID, chatId(externalUserId));
        request.set(PARAM_TEXT, text);
        try {
            String response = restClient.post()
                .uri(credentials.url() + PATH_SEND_MESSAGE)
                .contentType(MediaType.APPLICATION_JSON)
                .body(request.toString())
                .retrieve()
                .body(String.class);
            return outcome(response);
        } catch (HttpStatusCodeException e) {
            // 渠道错误（HTTP 4xx/5xx）：官方错误包络仍以 JSON 体返回，按包络如实描述
            return ChannelSendResult.failed("Telegram 消息发送失败：" + describe(e.getResponseBodyAsString()));
        } catch (RuntimeException e) {
            // 网络与响应读取异常按调用失败记录；异常消息可能含带 token 的地址，只留类名
            log.warn("[telegram] 消息发送失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelSendResult.failed("Telegram 接口调用失败：" + e.getClass().getSimpleName());
        }
    }

    // 成功与失败由官方包络判定：ok=true 取 result.message_id（接口必返回 Message），
    // 其余形状如实失败，不把无法识别的响应当成功
    private ChannelSendResult outcome(String response) {
        String error = describe(response);
        if (error != null) {
            return ChannelSendResult.failed("Telegram 消息发送失败：" + error);
        }
        JSONObject result = JSONUtil.parseObj(response).getJSONObject(KEY_RESULT);
        Object messageId = result == null ? null : result.get(KEY_MESSAGE_ID);
        return ChannelSendResult.sent(messageId == null ? null : String.valueOf(messageId));
    }

    // 错误描述：官方包络 ok=false 给「error_code description（retry_after N 秒）」，
    // 非 JSON 或缺 ok 字段一律「响应无法识别」；null 表示无错误形状（成功包络）
    private String describe(String rawResponse) {
        JSONObject envelope;
        try {
            envelope = JSONUtil.parseObj(rawResponse);
        } catch (RuntimeException e) {
            return "响应无法识别";
        }
        if (!(envelope.get(KEY_OK) instanceof Boolean ok)) {
            return "响应无法识别";
        }
        if (ok) {
            return null;
        }
        StringBuilder error = new StringBuilder();
        Object errorCode = envelope.get(KEY_ERROR_CODE);
        if (errorCode != null) {
            error.append(errorCode);
        }
        String description = envelope.getStr(KEY_DESCRIPTION, "");
        if (!description.isEmpty()) {
            if (!error.isEmpty()) {
                error.append(' ');
            }
            error.append(description);
        }
        JSONObject parameters = envelope.getJSONObject(KEY_PARAMETERS);
        Object retryAfter = parameters == null ? null : parameters.get(KEY_RETRY_AFTER);
        if (retryAfter != null) {
            error.append("（retry_after ").append(retryAfter).append(" 秒）");
        }
        return error.isEmpty() ? "响应无法识别" : error.toString();
    }

    // chat_id 官方类型 Integer or String：数字标识按官方样本以数字下发（chat.id 可超
    // 32 位按 64 位），非数字（如 @username）原样字符串
    private Object chatId(String externalUserId) {
        try {
            return Long.parseLong(externalUserId);
        } catch (NumberFormatException e) {
            return externalUserId;
        }
    }
}
