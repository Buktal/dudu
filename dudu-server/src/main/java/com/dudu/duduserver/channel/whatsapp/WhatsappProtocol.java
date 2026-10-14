package com.dudu.duduserver.channel.whatsapp;

import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONException;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.support.Digests;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.channel.support.MessageBodies;
import com.dudu.duduserver.channel.support.Texts;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * WhatsApp Cloud API 回调协议原语（事实见 docs/research/channels/whatsapp.md）：
 * 验签为 X-Hub-Signature-256 = "sha256=" + hex(HMAC-SHA256(appSecret, POST 原始
 * body))（§4.1），对原始字节摘要（先 parse 再重序列化会改变 digest）并常量时间比较；
 * GET 握手比对 verifyToken 由适配器完成（verifyToken 与 appSecret 是两个无关值）。
 * 信封 object → entry[] → changes[] → value（§2.1）：value.messages[] 为用户来语按
 * type 解析（§2.3），value.statuses[] 与管理面字段变更只应答不落库；一个信封按官方
 * 单消息口径取首个 messages[] 元素落库，未收录形态如实落 unknown。官方 §5.1/§5.2
 * 信封 + Node 交叉复算签名为回归基准。
 */
@Component
public class WhatsappProtocol {

    // 签名头形态（官方 §4.2）：sha256= 前缀 + 64 位 hex 摘要
    private static final String SIGNATURE_PREFIX = "sha256=";

    // 契约第 4 节统一消息体键名（与 wechat-mp/feishu 等适配器同键）
    private static final String KEY_TYPE = "type";
    private static final String TYPE_TEXT = "text";
    private static final String TYPE_LOCATION = "location";
    private static final String KIND_IMAGE = "image";
    private static final String KIND_AUDIO = "audio";
    private static final String KIND_VIDEO = "video";
    private static final String KIND_FILE = "file";

    // inbound messages[] 的 type 取值（§2.3 各 type 子页）
    private static final String MSG_IMAGE = "image";
    private static final String MSG_AUDIO = "audio";
    private static final String MSG_VIDEO = "video";
    private static final String MSG_DOCUMENT = "document";
    private static final String MSG_STICKER = "sticker";
    private static final String MSG_LOCATION = "location";
    private static final String MSG_INTERACTIVE = "interactive";
    private static final String MSG_BUTTON = "button";
    private static final String FIELD_MESSAGES = "messages";

    /**
     * POST 验签（§4.1）：key = appSecret、msg = 原始 body 字节的 HMAC-SHA256，与头中
     * "sha256=" 之后的 hex 比对；appSecret、头或 body 缺失，头缺前缀、非 hex 或长度
     * 不足一律 false，不抛异常。verifyToken 不参与 POST 验签（仅 GET 握手用）。
     */
    public boolean verify(String appSecret, String signatureHeader, String body) {
        if (Texts.isBlank(appSecret) || Texts.isBlank(signatureHeader) || body == null
            || !signatureHeader.startsWith(SIGNATURE_PREFIX)) {
            return false;
        }
        byte[] received;
        try {
            received = HexFormat.of().parseHex(signatureHeader.substring(SIGNATURE_PREFIX.length()));
        } catch (IllegalArgumentException e) {
            return false;
        }
        return Digests.constantTimeEquals(digest(appSecret, body), received);
    }

    /**
     * 解析推送报文（§2.1/§2.3）：首个 messages[] 元素转为统一入站消息（wamid 为幂等键，
     * 发送方取 messages[].from、名称取 wa_id 匹配的 contacts[].profile.name）；statuses[]
     * 与管理面字段变更返回空表示只应答不落库。报文无法解析、缺少 entry 或来语缺少
     * 身份/幂等键时抛出 {@link IllegalArgumentException}，由调用方按参数错误拒绝。
     */
    public Optional<ChannelInboundMessage> parse(Long companyChannelId, String body) {
        JSONObject root;
        try {
            root = JSONUtil.parseObj(body);
        } catch (JSONException e) {
            throw new IllegalArgumentException("回调报文不是合法 JSON", e);
        }
        if (!(root.get("entry") instanceof JSONArray entries)) {
            throw new IllegalArgumentException("回调报文缺少 entry 数组");
        }
        for (Object rawEntry : entries) {
            if (!(rawEntry instanceof JSONObject entry) || !(entry.get("changes") instanceof JSONArray changes)) {
                continue;
            }
            for (Object rawChange : changes) {
                if (!(rawChange instanceof JSONObject change) || !FIELD_MESSAGES.equals(change.getStr("field"))) {
                    continue;
                }
                Optional<ChannelInboundMessage> inbound = message(companyChannelId, change.getJSONObject("value"));
                if (inbound.isPresent()) {
                    return inbound;
                }
            }
        }
        // statuses、管理面字段变更与空 value 都没有可落库的访客消息
        return Optional.empty();
    }

    // 单条来语装配：from 为访客身份、id 为 wamid 幂等键，缺失即无法入站
    private Optional<ChannelInboundMessage> message(Long companyChannelId, JSONObject value) {
        if (value == null || !(value.get(FIELD_MESSAGES) instanceof JSONArray messages) || messages.isEmpty()) {
            return Optional.empty();
        }
        Object first = messages.get(0);
        if (!(first instanceof JSONObject payload)) {
            return Optional.empty();
        }
        String from = Texts.blankToNull(payload.getStr("from"));
        String wamid = Texts.blankToNull(payload.getStr("id"));
        if (from == null || wamid == null) {
            throw new IllegalArgumentException("渠道来语缺少发送方身份或 wamid 幂等键");
        }
        return Optional.of(new ChannelInboundMessage(companyChannelId, from, senderName(value, from), null,
            List.of(), wamid, MessageDirectionEnum.INCOMING, content(payload)));
    }

    // 名称取与 from 匹配的 contacts[].profile.name（§5.1）；不匹配或缺失按未提供处理
    private String senderName(JSONObject value, String from) {
        if (!(value.get("contacts") instanceof JSONArray contacts)) {
            return null;
        }
        for (Object raw : contacts) {
            if (raw instanceof JSONObject contact && from.equals(contact.getStr("wa_id"))) {
                JSONObject profile = contact.getJSONObject("profile");
                return profile == null ? null : Texts.blankToNull(profile.getStr("name"));
            }
        }
        return null;
    }

    // 按 type 映射契约第 4 节统一消息体；渠道不提供的可选信息省略，无法映射的按 unknown 如实保存
    private Map<String, Object> content(JSONObject payload) {
        String type = payload.getStr(KEY_TYPE, "");
        try {
            return switch (type) {
                case TYPE_TEXT -> Map.of(KEY_TYPE, TYPE_TEXT, "text", payload.getJSONObject(TYPE_TEXT)
                    .getStr("body", ""));
                case MSG_IMAGE -> media(MSG_IMAGE, KIND_IMAGE, payload);
                case MSG_AUDIO -> media(MSG_AUDIO, KIND_AUDIO, payload);
                case MSG_VIDEO -> media(MSG_VIDEO, KIND_VIDEO, payload);
                case MSG_DOCUMENT -> media(MSG_DOCUMENT, KIND_FILE, payload);
                // sticker 为 webp 图片，按可读图片处理（§2.3 mime_type image/webp）
                case MSG_STICKER -> media(MSG_STICKER, KIND_IMAGE, payload);
                case MSG_LOCATION -> location(payload);
                // 用户点按的 title 即来语文本：button_reply/list_reply（§2.3）
                case MSG_INTERACTIVE -> interactive(payload);
                case MSG_BUTTON -> button(payload);
                // reaction/contacts/unsupported 等契约无对应形态，如实落 unknown
                default -> MessageBodies.unknown(type);
            };
        } catch (RuntimeException e) {
            // 字段值不符合类型约定（如坐标缺失非数值）时如实落 unknown，不猜测内容
            return MessageBodies.unknown(type);
        }
    }

    // 媒体引用只带可读 id（document 附 filename）；缺 id 即无契约要求的引用，按 unknown 不填假值。
    // 载荷灰度下发的 url 需 Bearer 下载，不是公开直链，不进媒体引用（§2.3/§5.6）
    private Map<String, Object> media(String msgType, String kind, JSONObject payload) {
        JSONObject body = payload.getJSONObject(msgType);
        String id = body == null ? null : Texts.blankToNull(body.getStr("id"));
        if (id == null) {
            return MessageBodies.unknown(msgType);
        }
        return MessageBodies.media(kind, id, null, body.getStr("filename"));
    }

    // location（§2.3）：名称优先作 label、地址回退；坐标为数值，缺失即按 unknown
    private Map<String, Object> location(JSONObject payload) {
        JSONObject body = payload.getJSONObject(MSG_LOCATION);
        Double latitude = body == null ? null : body.getDouble("latitude", null);
        Double longitude = body == null ? null : body.getDouble("longitude", null);
        if (latitude == null || longitude == null) {
            return MessageBodies.unknown(MSG_LOCATION);
        }
        Map<String, Object> content = new LinkedHashMap<>();
        content.put(KEY_TYPE, TYPE_LOCATION);
        String label = Texts.blankToNull(body.getStr("name"));
        if (label == null) {
            label = Texts.blankToNull(body.getStr("address"));
        }
        if (label != null) {
            content.put("label", label);
        }
        content.put("latitude", latitude);
        content.put("longitude", longitude);
        return content;
    }

    // interactive 入站仅 button_reply/list_reply 两形态（§2.3），title 即来语文本
    private Map<String, Object> interactive(JSONObject payload) {
        JSONObject body = payload.getJSONObject(MSG_INTERACTIVE);
        if (body != null) {
            for (String shape : new String[] {"button_reply", "list_reply"}) {
                JSONObject reply = body.getJSONObject(shape);
                String title = reply == null ? null : Texts.blankToNull(reply.getStr("title"));
                if (title != null) {
                    return Map.of(KEY_TYPE, TYPE_TEXT, "text", title);
                }
            }
        }
        return MessageBodies.unknown(MSG_INTERACTIVE);
    }

    // 模板 quick-reply 点击（type:button，§2.3）：button.text 即来语文本
    private Map<String, Object> button(JSONObject payload) {
        JSONObject body = payload.getJSONObject(MSG_BUTTON);
        String label = body == null ? null : Texts.blankToNull(body.getStr("text"));
        return label == null ? MessageBodies.unknown(MSG_BUTTON) : Map.of(KEY_TYPE, TYPE_TEXT, "text", label);
    }

    // HMAC-SHA256(appSecret, 原始 body 字节)
    private byte[] digest(String appSecret, String body) {
        return Digests.hmacSha256(appSecret.getBytes(StandardCharsets.UTF_8), body.getBytes(StandardCharsets.UTF_8));
    }


}
