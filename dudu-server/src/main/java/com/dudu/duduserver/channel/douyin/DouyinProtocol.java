package com.dudu.duduserver.channel.douyin;

import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONException;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.support.Digests;
import com.dudu.duduserver.channel.support.JsonBodies;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.channel.support.MessageBodies;
import com.dudu.duduserver.channel.support.Texts;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
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
    private static final String KEY_COMPONENT_ID = "component_id";
    // 组件配置串：content 内同名子字段为 JSON 字符串（§5.18 逐字样本）
    private static final String KEY_PRODUCT_CONFIG = "product";
    private static final String KEY_PRODUCT_NAME = "product_name";
    private static final String KEY_PRODUCT_ID = "product_id";
    private static final String KEY_QUESTION_LIST_CONFIG = "question_list";
    private static final String KEY_TITLE = "title";
    private static final String KEY_USER_INFOS = "user_infos";
    private static final String KEY_OPEN_ID = "open_id";
    private static final String KEY_NICK_NAME = "nick_name";
    private static final String KEY_AVATAR = "avatar";
    private static final String KEY_TEXT = "text";
    private static final String EVENT_VERIFY_WEBHOOK = "verify_webhook";
    private static final String EVENT_IM_RECEIVE_MSG = "im_receive_msg";
    private static final String EVENT_IM_SEND_MSG = "im_send_msg";

    // IM 消息 message_type 枚举（官方 §2.2 + §2.4 企业号线索组件对照表，v1.0.5 新增七类）；未列出的按 unknown 如实保存
    private static final String MSG_TEXT = "text";
    private static final String MSG_IMAGE = "image";
    private static final String MSG_USER_LOCAL_IMAGE = "user_local_image";
    private static final String MSG_EMOJI = "emoji";
    private static final String MSG_VIDEO = "video";
    private static final String MSG_USER_LOCAL_VIDEO = "user_local_video";
    private static final String MSG_RETAIN_CONSULT_CARD = "retain_consult_card";
    private static final String MSG_LEADS_PHONE_CARD = "leads_phone_card";
    private static final String MSG_LEAD_COMMODITY_CARD = "lead_commodity_card";
    private static final String MSG_POI_CARD = "poi_card";
    private static final String MSG_PREMIUM_ONLINE_APPOINTMENT_CARD = "premium_online_appointment_card";
    private static final String MSG_INVESTMENT_FRANCHISE_CARD = "investment_franchise_card";
    private static final String MSG_POST_SALE_ORDER_CARD = "post_sale_order_card";
    private static final String MSG_PHONE_COLLECTION_CARD = "phone_collection_card";
    private static final String MSG_ENTERPRISE_WECHAT_CARD = "enterprise_wechat_card";
    private static final String MSG_PRODUCT = "product";
    private static final String MSG_NOTICE = "notice";
    private static final String MSG_QUESTION_LIST = "question_list";

    // 统一消息体的媒体 kind（契约第 4 节）；表情按图片呈现（gif 直链或占位）
    private static final String KIND_IMAGE = "image";
    private static final String KIND_VIDEO = "video";

    // 媒体下标：单媒体消息恒为 0（契约第 4 节「消息 ID:媒体下标」派生稳定标识）
    private static final String DERIVED_INDEX = ":0";

    /**
     * 解析事件推送（官方 §2.1/§2.2 信封）：im_receive_msg 与 im_send_msg 转为统一
     * 消息——两事件 content 同构、方向相反：来信访客身份取 from_user_id，同步的商家
     * 发出消息（授权号在抖音 App 原生回复等场景）访客取 to_user_id，渠道消息标识与
     * 媒体要素的账号身份随之互换（§6.1 回复三要素 server_message_id:
     * conversation_short_id:账号 open_id）；进入会话页、撤回、已读及授权类事件返回
     * 空表示只应答不落库。报文无法解析或缺少访客身份时抛出
     * {@link IllegalArgumentException}，由调用方按参数错误拒绝。
     */
    public Optional<ChannelInboundMessage> parse(Long companyChannelId, String body) {
        JSONObject envelope;
        try {
            envelope = JSONUtil.parseObj(body);
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("抖音事件报文无法解析", e);
        }
        String event = envelope.getStr(KEY_EVENT, "");
        boolean fromVisitor = EVENT_IM_RECEIVE_MSG.equals(event);
        if (!fromVisitor && !EVENT_IM_SEND_MSG.equals(event)) {
            // 其余事件（含缺 event 字段的未知推送）按渠道口径只应答
            return Optional.empty();
        }
        String externalUserId = envelope.getStr(fromVisitor ? KEY_FROM_USER_ID : KEY_TO_USER_ID, null);
        if (externalUserId == null || externalUserId.isBlank()) {
            throw new IllegalArgumentException("抖音事件缺少访客身份（" + event + " 的 "
                + (fromVisitor ? KEY_FROM_USER_ID : KEY_TO_USER_ID) + "）");
        }
        JSONObject content = contentOf(envelope);
        String messageType = content.getStr(KEY_MESSAGE_TYPE, "");
        String serverMessageId = content.getStr(KEY_SERVER_MESSAGE_ID, null);
        String conversationId = content.getStr(KEY_CONVERSATION_SHORT_ID, null);
        String ownerOpenId = envelope.getStr(fromVisitor ? KEY_TO_USER_ID : KEY_FROM_USER_ID, null);
        return Optional.of(new ChannelInboundMessage(companyChannelId, externalUserId,
            visitorName(content, externalUserId), visitorAvatar(content, externalUserId), List.of(),
            replyContext(serverMessageId, conversationId, ownerOpenId),
            fromVisitor ? MessageDirectionEnum.INCOMING : MessageDirectionEnum.OUTGOING,
            unifiedBody(messageType, serverMessageId, conversationId, ownerOpenId, content)));
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
        JSONArray userInfos = JsonBodies.arrayField(content, KEY_USER_INFOS, "抖音事件报文");
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
        if (Texts.isBlank(serverMessageId)) {
            return null;
        }
        if (Texts.isBlank(conversationId) || Texts.isBlank(ownerOpenId)) {
            return serverMessageId;
        }
        return serverMessageId + ":" + conversationId + ":" + ownerOpenId;
    }

    // 按 message_type 映射统一消息体；渠道不提供的可选信息省略，无法映射的按 unknown 如实保存
    private Map<String, Object> unifiedBody(String messageType, String serverMessageId, String conversationId,
                                            String ownerOpenId, JSONObject content) {
        try {
            return switch (messageType) {
                case MSG_TEXT -> Map.of("type", "text", KEY_TEXT, content.getStr(KEY_TEXT, ""));
                case MSG_IMAGE, MSG_USER_LOCAL_IMAGE -> media(messageType, KIND_IMAGE, serverMessageId,
                    conversationId, ownerOpenId, content);
                case MSG_EMOJI -> media(messageType, KIND_IMAGE, serverMessageId, conversationId, ownerOpenId, content);
                case MSG_VIDEO, MSG_USER_LOCAL_VIDEO -> media(messageType, KIND_VIDEO, serverMessageId,
                    conversationId, ownerOpenId, content);
                case MSG_RETAIN_CONSULT_CARD, MSG_LEADS_PHONE_CARD, MSG_LEAD_COMMODITY_CARD,
                     MSG_POI_CARD, MSG_PREMIUM_ONLINE_APPOINTMENT_CARD,
                     MSG_INVESTMENT_FRANCHISE_CARD, MSG_POST_SALE_ORDER_CARD,
                     MSG_PHONE_COLLECTION_CARD, MSG_ENTERPRISE_WECHAT_CARD -> cardBody(messageType, content);
                case MSG_PRODUCT -> configCardBody(MSG_PRODUCT, content, KEY_PRODUCT_CONFIG,
                    KEY_PRODUCT_NAME, KEY_PRODUCT_ID);
                case MSG_QUESTION_LIST -> configCardBody(MSG_QUESTION_LIST, content,
                    KEY_QUESTION_LIST_CONFIG, KEY_TITLE, null);
                // 系统提示（§5.18.4）是平台系统消息而非访客输入，信封归属无样本可证，
                // tips 不映射 text，按 unknown 带渠道原因说明
                case MSG_NOTICE -> MessageBodies.unknown(messageType,
                    "抖音系统提示类消息（如智能客服介入接待），非访客输入内容");
                default -> MessageBodies.unknown(messageType);
            };
        } catch (RuntimeException e) {
            // 字段值不符合类型约定时如实落 unknown，不猜测内容
            return MessageBodies.unknown(messageType);
        }
    }

    // 媒体标识（§6.2）：渠道标识优先（item_id/media_id 或非空 resource_url 直链），
    // 载荷不带标识时按派生标识留存；连消息标识都没有则无引用，按 unknown 如实保存不填假值
    private Map<String, Object> media(String messageType, String kind, String serverMessageId,
                                      String conversationId, String ownerOpenId, JSONObject content) {
        if (Texts.isBlank(serverMessageId)) {
            return MessageBodies.unknown(messageType);
        }
        String resourceUrl = Texts.blankToNull(content.getStr(KEY_RESOURCE_URL, null));
        String identifier = Texts.firstNonBlank(content.getStr(KEY_ITEM_ID, null),
            content.getStr(KEY_MEDIA_ID, null), resourceUrl,
            derivedIdentifier(messageType, serverMessageId, conversationId, ownerOpenId));
        return MessageBodies.media(kind, identifier, resourceUrl, null);
    }

    // 派生标识：user_local 图片/视频经 GetIMMessageResource 读取（§8.4），按
    // 「消息 ID:会话 ID:账号 open_id:媒体下标」四段复合留存接口三要素与下标（各段值
    // 均不含冒号，冒号仅作分隔）；分享类 image/video 与 emoji 无官方下载通道，保持
    // 「消息 ID:媒体下标」两段。会话或账号身份缺失时按两段留存，不猜会话
    private String derivedIdentifier(String messageType, String serverMessageId,
                                     String conversationId, String ownerOpenId) {
        boolean localMedia = MSG_USER_LOCAL_IMAGE.equals(messageType) || MSG_USER_LOCAL_VIDEO.equals(messageType);
        if (!localMedia || Texts.isBlank(conversationId) || Texts.isBlank(ownerOpenId)) {
            return serverMessageId + DERIVED_INDEX;
        }
        return serverMessageId + ":" + conversationId + ":" + ownerOpenId + DERIVED_INDEX;
    }

    /**
     * 四段复合媒体标识（§8.4 GetIMMessageResource 三要素 + 媒体下标）解析：与
     * {@link #derivedIdentifier} 派生同源，非四段或任一段空白返回 null，由调用方按
     * 其他引用形态分流（http(s) 直链或无下载通道说明）。
     */
    public MediaResource mediaResourceOf(String externalMediaId) {
        if (Texts.isBlank(externalMediaId)) {
            return null;
        }
        String[] parts = externalMediaId.split(":", -1);
        if (parts.length != 4 || Texts.isBlank(parts[0]) || Texts.isBlank(parts[1])
            || Texts.isBlank(parts[2]) || Texts.isBlank(parts[3])) {
            return null;
        }
        return new MediaResource(parts[0], parts[1], parts[2], parts[3]);
    }

    // GetIMMessageResource 请求三要素：index 为媒体下标（单媒体恒 0），当前不参与
    // 接口调用，承载契约位以便多媒体扩展
    public record MediaResource(String serverMessageId, String conversationId, String ownerOpenId, String index) {
    }

    // 卡片类消息（留资卡与线索组件卡）：kind 保留官方 message_type 语义名；组件 id
    // 取 content 顶层 component_id（§5.18.1 逐字样本），旧类型无样本字段回退 card_id；
    // 组件配置串其余字段无契约位，不映射为假字段
    private Map<String, Object> cardBody(String messageType, JSONObject content) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("type", "card");
        body.put("kind", messageType);
        String externalId = Texts.firstNonBlank(content.getStr(KEY_COMPONENT_ID, null),
            content.getStr(KEY_CARD_ID, null));
        if (externalId != null) {
            body.put("externalId", externalId);
        }
        return body;
    }

    // 带配置串的卡片（§5.18.3/§5.18.5 逐字样本）：content 内 configKey 子字段为 JSON
    // 字符串，取 titleField 与 externalIdField 映射 title/externalId（无该字段位传
    // null 跳过）；配置串缺失或无法解析时按 kind 原样落 card，不猜内容
    private Map<String, Object> configCardBody(String messageType, JSONObject content,
                                               String configKey, String titleField, String externalIdField) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("type", "card");
        body.put("kind", messageType);
        JSONObject payload = parseConfigOrNull(content, configKey);
        if (payload != null) {
            String title = Texts.blankToNull(payload.getStr(titleField, null));
            if (title != null) {
                body.put("title", title);
            }
            if (externalIdField != null) {
                String externalId = Texts.blankToNull(payload.getStr(externalIdField, null));
                if (externalId != null) {
                    body.put("externalId", externalId);
                }
            }
        }
        return body;
    }

    private JSONObject parseConfigOrNull(JSONObject content, String configKey) {
        String config = Texts.blankToNull(content.getStr(configKey, null));
        if (config == null) {
            return null;
        }
        try {
            return JSONUtil.parseObj(config);
        } catch (RuntimeException e) {
            return null;
        }
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
        JSONObject content;
        try {
            // content 官方为 object；无法转为对象时与缺失同样按参数错误拒绝
            content = json.getJSONObject(KEY_CONTENT);
        } catch (JSONException | ClassCastException e) {
            throw new IllegalArgumentException("抖音握手报文 content 类型不符", e);
        }
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
        return Digests.constantTimeEquals(signature(credentials.clientSecret(), body), signature);
    }

    // 官方 §4.1 签名算法：sha1(client_secret + 原始 body 字节) 小写 hex（Go 示例 %x）
    private String signature(String clientSecret, String body) {
        byte[] prefix = clientSecret.getBytes(StandardCharsets.UTF_8);
        byte[] rawBody = (body == null ? "" : body).getBytes(StandardCharsets.UTF_8);
        byte[] input = new byte[prefix.length + rawBody.length];
        System.arraycopy(prefix, 0, input, 0, prefix.length);
        System.arraycopy(rawBody, 0, input, prefix.length, rawBody.length);
        return Digests.sha1Hex(input);
    }
}
