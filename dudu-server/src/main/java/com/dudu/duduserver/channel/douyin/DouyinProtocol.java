package com.dudu.duduserver.channel.douyin;

import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 抖音回调协议（事实见 docs/research/channels/douyin.md §4.1）：验签材料全在
 * HTTP header——X-Douyin-Signature = 小写 hex sha1(client_secret + 原始 body 字节)，
 * 无 query 参数参与、消息体不加密；verify_webhook 握手与事件推送走同一验签
 * （§3.1/§3.3）。解析与统一消息体映射由后续职责方法承接。
 */
@Component
public class DouyinProtocol {

    // 事件信封与握手报文的字段名（官方 §2.1、§3.1）
    private static final String KEY_EVENT = "event";
    private static final String KEY_CONTENT = "content";
    private static final String KEY_CHALLENGE = "challenge";
    private static final String KEY_FROM_USER_ID = "from_user_id";
    private static final String KEY_TO_USER_ID = "to_user_id";
    private static final String KEY_SERVER_MESSAGE_ID = "server_message_id";
    private static final String KEY_CONVERSATION_SHORT_ID = "conversation_short_id";
    private static final String KEY_MESSAGE_TYPE = "message_type";
    private static final String KEY_ITEM_ID = "item_id";
    private static final String KEY_MEDIA_ID = "media_id";
    private static final String KEY_RESOURCE_URL = "resource_url";
    private static final String KEY_CARD_ID = "card_id";
    private static final String KEY_USER_INFOS = "user_infos";
    private static final String KEY_OPEN_ID = "open_id";
    private static final String KEY_NICK_NAME = "nick_name";
    private static final String KEY_AVATAR = "avatar";
    private static final String KEY_TEXT = "text";
    private static final String EVENT_VERIFY_WEBHOOK = "verify_webhook";
    private static final String EVENT_IM_RECEIVE_MSG = "im_receive_msg";

    // IM 消息 message_type 枚举（官方 §2.2）；未列出的按 unknown 如实保存
    private static final String MSG_TEXT = "text";
    private static final String MSG_IMAGE = "image";
    private static final String MSG_USER_LOCAL_IMAGE = "user_local_image";
    private static final String MSG_EMOJI = "emoji";
    private static final String MSG_VIDEO = "video";
    private static final String MSG_USER_LOCAL_VIDEO = "user_local_video";
    private static final String MSG_RETAIN_CONSULT_CARD = "retain_consult_card";

    // 统一消息体的媒体 kind（契约第 4 节）；表情按图片呈现（gif 直链或占位）
    private static final String KIND_IMAGE = "image";
    private static final String KIND_VIDEO = "video";

    // 媒体下标：单媒体消息恒为 0（契约第 4 节「消息 ID:媒体下标」派生稳定标识）
    private static final String DERIVED_INDEX = ":0";

    /**
     * 解析事件推送（官方 §2.1 信封）：仅 im_receive_msg 转为统一入站消息——访客身份取
     * from_user_id（user_infos 补昵称头像），回复三要素随消息留存于渠道消息标识
     * （server_message_id:conversation_short_id:信封 to_user_id，§6.1）；im_send_msg、
     * 进入会话页、撤回、已读及授权类事件返回空表示只应答不落库。报文无法解析或
     * 缺少访客身份时抛出 {@link IllegalArgumentException}，由调用方按参数错误拒绝。
     */
    public Optional<ChannelInboundMessage> parse(Long companyChannelId, String body) {
        JSONObject envelope;
        try {
            envelope = JSONUtil.parseObj(body);
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("抖音事件报文无法解析", e);
        }
        String event = envelope.getStr(KEY_EVENT, "");
        if (!EVENT_IM_RECEIVE_MSG.equals(event)) {
            // 其余事件（含缺 event 字段的未知推送）按渠道口径只应答
            return Optional.empty();
        }
        String externalUserId = envelope.getStr(KEY_FROM_USER_ID, null);
        if (externalUserId == null || externalUserId.isBlank()) {
            throw new IllegalArgumentException("抖音事件缺少发送方身份 from_user_id");
        }
        JSONObject content = contentOf(envelope);
        String messageType = content.getStr(KEY_MESSAGE_TYPE, "");
        String serverMessageId = content.getStr(KEY_SERVER_MESSAGE_ID, null);
        String conversationId = content.getStr(KEY_CONVERSATION_SHORT_ID, null);
        String ownerOpenId = envelope.getStr(KEY_TO_USER_ID, null);
        return Optional.of(new ChannelInboundMessage(companyChannelId, externalUserId,
            visitorName(content, externalUserId), visitorAvatar(content, externalUserId), List.of(),
            replyContext(serverMessageId, conversationId, ownerOpenId), MessageDirectionEnum.INCOMING,
            unifiedBody(messageType, serverMessageId, content)));
    }

    // content 双形态兼容（票面要点 2）：IM 消息为 object，部分事件为 JSON 字符串
    private JSONObject contentOf(JSONObject envelope) {
        Object content = envelope.get(KEY_CONTENT);
        if (content instanceof JSONObject json) {
            return json;
        }
        if (content instanceof String text && !text.isBlank()) {
            try {
                return JSONUtil.parseObj(text);
            } catch (RuntimeException e) {
                throw new IllegalArgumentException("抖音事件 content 无法解析", e);
            }
        }
        return new JSONObject();
    }

    // 访客昵称/头像：user_infos 中 open_id 与发送方一致的记录（§5.10；缺失如实省略）
    private String visitorName(JSONObject content, String externalUserId) {
        return visitorInfo(content, externalUserId, KEY_NICK_NAME);
    }

    private String visitorAvatar(JSONObject content, String externalUserId) {
        return visitorInfo(content, externalUserId, KEY_AVATAR);
    }

    private String visitorInfo(JSONObject content, String externalUserId, String field) {
        JSONArray userInfos = content.getJSONArray(KEY_USER_INFOS);
        if (userInfos == null) {
            return null;
        }
        for (Object item : userInfos) {
            if (item instanceof JSONObject user && externalUserId.equals(user.getStr(KEY_OPEN_ID, null))) {
                String value = user.getStr(field, null);
                return value == null || value.isBlank() ? null : value;
            }
        }
        return null;
    }

    // 回复三要素（§6.1）：三值齐全才构成复合标识，缺项时退化为裸 server_message_id
    // 或空——发送侧解析不出三段就如实失败，不猜会话
    private String replyContext(String serverMessageId, String conversationId, String ownerOpenId) {
        if (isBlank(serverMessageId)) {
            return null;
        }
        if (isBlank(conversationId) || isBlank(ownerOpenId)) {
            return serverMessageId;
        }
        return serverMessageId + ":" + conversationId + ":" + ownerOpenId;
    }

    // 按 message_type 映射统一消息体；渠道不提供的可选信息省略，无法映射的按 unknown 如实保存
    private Map<String, Object> unifiedBody(String messageType, String serverMessageId, JSONObject content) {
        try {
            return switch (messageType) {
                case MSG_TEXT -> Map.of("type", "text", KEY_TEXT, content.getStr(KEY_TEXT, ""));
                case MSG_IMAGE, MSG_USER_LOCAL_IMAGE -> media(messageType, KIND_IMAGE, serverMessageId, content);
                case MSG_EMOJI -> media(messageType, KIND_IMAGE, serverMessageId, content);
                case MSG_VIDEO, MSG_USER_LOCAL_VIDEO -> media(messageType, KIND_VIDEO, serverMessageId, content);
                case MSG_RETAIN_CONSULT_CARD -> retainCard(messageType, content);
                default -> unknown(messageType);
            };
        } catch (RuntimeException e) {
            // 字段值不符合类型约定时如实落 unknown，不猜测内容
            return unknown(messageType);
        }
    }

    // 媒体标识（§6.2）：渠道标识优先（item_id/media_id 或非空 resource_url 直链），
    // 载荷不带标识时按「消息 ID:媒体下标」派生稳定标识；连消息标识都没有则无引用，
    // 按 unknown 如实保存不填假值
    private Map<String, Object> media(String messageType, String kind, String serverMessageId, JSONObject content) {
        if (isBlank(serverMessageId)) {
            return unknown(messageType);
        }
        String resourceUrl = blankToNull(content.getStr(KEY_RESOURCE_URL, null));
        String identifier = firstNonBlank(content.getStr(KEY_ITEM_ID, null),
            content.getStr(KEY_MEDIA_ID, null), resourceUrl, serverMessageId + DERIVED_INDEX);
        Map<String, Object> media = new LinkedHashMap<>();
        media.put("kind", kind);
        media.put("id", identifier);
        if (resourceUrl != null) {
            media.put("url", resourceUrl);
        }
        return Map.of("type", kind, "media", media);
    }

    // 留资卡片：card 分支只承载 kind 与 card_id（契约 card 无逐项数据位，card_data 不映射为假字段）
    private Map<String, Object> retainCard(String messageType, JSONObject content) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("type", "card");
        body.put("kind", messageType);
        String cardId = blankToNull(content.getStr(KEY_CARD_ID, null));
        if (cardId != null) {
            body.put("externalId", cardId);
        }
        return body;
    }

    private Map<String, Object> unknown(String messageType) {
        return Map.of("type", "unknown", "originalType", messageType == null || messageType.isEmpty()
            ? "unknown" : messageType);
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (!isBlank(value)) {
                return value;
            }
        }
        return null;
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    /**
     * verify_webhook 握手识别（官方 §3.1）：content 为 object、challenge 为数字，
     * 立即以 text 格式 JSON {@code {"challenge":<同值>}} 回显——值保持数字原样
     * （模拟器与官方校验都按数字比对）。事件推送与无法识别的报文返回 null，由
     * 调用方继续走事件解析；challenge 缺失或非数字无法如实回显时抛出
     * {@link IllegalArgumentException}，由调用方按参数错误拒绝。
     */
    public String challengeEcho(String body) {
        JSONObject json;
        try {
            json = JSONUtil.parseObj(body);
        } catch (RuntimeException e) {
            return null;
        }
        if (!EVENT_VERIFY_WEBHOOK.equals(json.getStr(KEY_EVENT, null))) {
            return null;
        }
        JSONObject content = json.getJSONObject(KEY_CONTENT);
        Object challenge = content == null ? null : content.get(KEY_CHALLENGE);
        if (!(challenge instanceof Number number)) {
            throw new IllegalArgumentException("抖音握手报文缺少数字 challenge");
        }
        return JSONUtil.createObj().set(KEY_CHALLENGE, number).toString();
    }

    /**
     * 验签：对 client_secret 拼接原始 body 字节取 sha1 小写 hex，与签名头比对；
     * 凭据或签名缺失、不符一律 false，由调用方按验签拒绝处理。
     */
    public boolean verify(DouyinCredentials credentials, String signature, String body) {
        if (credentials == null || signature == null || signature.isBlank()) {
            return false;
        }
        return signature.equalsIgnoreCase(signature(credentials.clientSecret(), body));
    }

    // 官方 §4.1 签名算法：sha1(client_secret + 原始 body 字节) 小写 hex（Go 示例 %x）
    private String signature(String clientSecret, String body) {
        byte[] prefix = clientSecret.getBytes(StandardCharsets.UTF_8);
        byte[] rawBody = (body == null ? "" : body).getBytes(StandardCharsets.UTF_8);
        byte[] input = new byte[prefix.length + rawBody.length];
        System.arraycopy(prefix, 0, input, 0, prefix.length);
        System.arraycopy(rawBody, 0, input, prefix.length, rawBody.length);
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-1").digest(input));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("当前运行环境缺少 SHA-1 实现", e);
        }
    }
}
