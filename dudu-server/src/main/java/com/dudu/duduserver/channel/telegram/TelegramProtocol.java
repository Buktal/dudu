package com.dudu.duduserver.channel.telegram;

import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONException;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.ChannelReceiveResult;
import com.dudu.duduserver.channel.support.Digests;
import com.dudu.duduserver.channel.support.MessageBodies;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Telegram 回调协议（事实见 docs/research/channels/telegram.md §2、§3.2、§4.1、§5.2）：
 * 推送为明文 JSON Update 信封（传输层 TLS 即全部，事件体无应用层加密），验签 = 恒等头
 * {@code X-Telegram-Bot-Api-Secret-Token} 与配置 secretToken 原样字符串常量时间相等比较
 * （无 HMAC、无签名、无 query 参数）。任一 Update 至多含一个可选事件字段；入站只取
 * {@code message} 的文本与媒体消息按契约映射，其余事件字段（含未来新增类型）只应答
 * 2XY 不落库；幂等以 update_id 为准。
 */
@Component
public class TelegramProtocol {

    // Update 信封键（§2.1）：update_id 为幂等键，message 为四件套入站事件字段
    private static final String KEY_UPDATE_ID = "update_id";
    private static final String KEY_MESSAGE = "message";

    // 消息身份与文本键（§5.2 官方样本逐字）
    private static final String KEY_FROM = "from";
    private static final String KEY_ID = "id";
    private static final String KEY_FIRST_NAME = "first_name";
    private static final String KEY_LAST_NAME = "last_name";
    private static final String KEY_TEXT = "text";

    // 媒体消息键（api#update Message 全表）：photo 为多分辨率 PhotoSize 数组
    private static final String KEY_PHOTO = "photo";
    private static final String KEY_VOICE = "voice";
    private static final String KEY_AUDIO = "audio";
    private static final String KEY_VIDEO = "video";
    private static final String KEY_VIDEO_NOTE = "video_note";
    private static final String KEY_DOCUMENT = "document";
    private static final String KEY_FILE_ID = "file_id";
    private static final String KEY_FILE_NAME = "file_name";
    private static final String KEY_TITLE = "title";
    private static final String KEY_WIDTH = "width";
    private static final String KEY_HEIGHT = "height";

    // 契约媒体形态（implementation-contract.md 第 4 节 MessageBody）
    private static final String KIND_IMAGE = "image";
    private static final String KIND_AUDIO = "audio";
    private static final String KIND_VIDEO = "video";
    private static final String KIND_FILE = "file";

    // 无类型判别字段的 Message：判 originalType 时排除信封与转发/回复等结构键，
    // 余下首个键即内容字段名（sticker、contact 等按字段名如实标注）
    private static final Set<String> STRUCTURAL_KEYS = Set.of(
        "message_id", "from", "date", "chat", "edit_date", "entities", "caption_entities",
        "media_group_id", "via_bot", "author_signature", "reply_to_message",
        "forward_origin", "forward_from", "forward_from_chat", "forward_date",
        "forward_signature", "is_automatic_forward", "reply_markup", "has_protected_content");

    /**
     * 恒等头验签（§4.1）：头值与配置 secretToken 原样字符串相等比较，无 HMAC 无签名；
     * 按字节常量时间比对，头缺失按校验失败处理。
     */
    public boolean verify(String headerValue, String secretToken) {
        if (headerValue == null || secretToken == null) {
            return false;
        }
        return Digests.constantTimeEquals(headerValue.getBytes(StandardCharsets.UTF_8),
            secretToken.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * 解析 Update 信封为接收结果：{@code message} 事件转统一入站消息（update_id 作幂等
     * 键），其余事件字段只应答 2XY。报文无法解析、缺 update_id 或消息缺发送方身份抛
     * {@link IllegalArgumentException} 由调用方按参数错误拒绝。
     */
    public ChannelReceiveResult parse(Long companyChannelId, String body) {
        JSONObject update;
        try {
            update = JSONUtil.parseObj(body);
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("Telegram 推送报文无法解析", e);
        }
        if (!(update.get(KEY_UPDATE_ID) instanceof Number)) {
            throw new IllegalArgumentException("Telegram 推送缺少幂等键 update_id");
        }
        String updateId = String.valueOf(update.get(KEY_UPDATE_ID));
        JSONObject message = objectField(update, KEY_MESSAGE);
        if (message == null) {
            // 其余 26 类事件字段（及未来新增类型）：只应答不落库
            return ChannelReceiveResult.answer(ChannelCallbackResult.success());
        }
        return ChannelReceiveResult.accept(inbound(companyChannelId, updateId, message));
    }

    // 发送方身份取 from.id（官方可超 32 位，按 64 位转字符串）；缺失即无法入站
    private ChannelInboundMessage inbound(Long companyChannelId, String updateId, JSONObject message) {
        JSONObject from = objectField(message, KEY_FROM);
        Object senderId = from == null ? null : from.get(KEY_ID);
        if (!(senderId instanceof Number)) {
            throw new IllegalArgumentException("Telegram 消息缺少发送方身份");
        }
        String externalUserId = String.valueOf(senderId);
        return new ChannelInboundMessage(
            companyChannelId,
            externalUserId,
            displayName(from),
            null,
            List.of(),
            updateId,
            MessageDirectionEnum.INCOMING,
            content(message));
    }

    // 姓名取 first/last name 拼接（渠道不提供头像，保持 null 不覆盖库中已有值）
    private String displayName(JSONObject from) {
        String firstName = text(from, KEY_FIRST_NAME);
        String lastName = text(from, KEY_LAST_NAME);
        if (firstName == null) {
            return lastName;
        }
        return lastName == null ? firstName : firstName + " " + lastName;
    }

    // 按 Message 的内容字段映射统一消息体；无类型判别字段，按已知键序检测，
    // 其余内容（sticker、contact 等与纯服务消息）如实落 unknown 并以字段名标注
    private Map<String, Object> content(JSONObject message) {
        String text = text(message, KEY_TEXT);
        if (text != null) {
            return Map.of("type", "text", "text", text);
        }
        Map<String, Object> media = mediaField(message);
        if (media != null) {
            return media;
        }
        return MessageBodies.unknown(originalType(message));
    }

    // 已知媒体字段按契约形态映射；引用缺失（空数组、缺 file_id）没有可如实表达的
    // 引用，按 unknown 保存不填假值
    private Map<String, Object> mediaField(JSONObject message) {
        JSONObject photo = largestPhoto(arrayField(message, KEY_PHOTO));
        if (photo != null) {
            return media(KIND_IMAGE, photo.getStr(KEY_FILE_ID, null), null);
        }
        JSONObject voice = objectField(message, KEY_VOICE);
        if (voice != null) {
            return media(KIND_AUDIO, voice.getStr(KEY_FILE_ID, null), null);
        }
        JSONObject audio = objectField(message, KEY_AUDIO);
        if (audio != null) {
            return media(KIND_AUDIO, audio.getStr(KEY_FILE_ID, null),
                firstText(text(audio, KEY_TITLE), text(audio, KEY_FILE_NAME)));
        }
        JSONObject video = objectField(message, KEY_VIDEO);
        if (video != null) {
            return media(KIND_VIDEO, video.getStr(KEY_FILE_ID, null), text(video, KEY_FILE_NAME));
        }
        JSONObject videoNote = objectField(message, KEY_VIDEO_NOTE);
        if (videoNote != null) {
            return media(KIND_VIDEO, videoNote.getStr(KEY_FILE_ID, null), null);
        }
        JSONObject document = objectField(message, KEY_DOCUMENT);
        if (document != null) {
            return media(KIND_FILE, document.getStr(KEY_FILE_ID, null), text(document, KEY_FILE_NAME));
        }
        return null;
    }

    // hutool 对无法转为对象/数组的值（如字符串取对象、对象取数组）抛 JSONException 或
    // ClassCastException，统一转参数错误由调用方按 400 应答，而不是作为未知异常按 500 处理
    private JSONObject objectField(JSONObject source, String key) {
        try {
            return source.getJSONObject(key);
        } catch (JSONException | ClassCastException e) {
            throw new IllegalArgumentException("Telegram 推送报文字段类型不符：" + key, e);
        }
    }

    private JSONArray arrayField(JSONObject source, String key) {
        try {
            return source.getJSONArray(key);
        } catch (JSONException | ClassCastException e) {
            throw new IllegalArgumentException("Telegram 推送报文字段类型不符：" + key, e);
        }
    }

    // photo 为同一图的多分辨率数组：取面积最大一档的 file_id 作素材引用
    private JSONObject largestPhoto(JSONArray photo) {
        if (photo == null || photo.isEmpty()) {
            return null;
        }
        JSONObject largest = null;
        long largestArea = -1;
        for (Object item : photo) {
            if (!(item instanceof JSONObject size)) {
                continue;
            }
            long area = (long) size.getInt(KEY_WIDTH, 0) * size.getInt(KEY_HEIGHT, 0);
            if (area > largestArea) {
                largestArea = area;
                largest = size;
            }
        }
        return largest;
    }

    // 素材标识即 file_id：getFile 换 file_path 下载只需这一个标识
    private Map<String, Object> media(String kind, String fileId, String name) {
        if (fileId == null || fileId.isBlank()) {
            return null;
        }
        return MessageBodies.media(kind, fileId, null, name);
    }

    // unknown 的 originalType：内容字段名（排除结构键后的首个键），无内容键按 message
    private String originalType(JSONObject message) {
        for (String key : message.keySet()) {
            if (!STRUCTURAL_KEYS.contains(key)) {
                return key;
            }
        }
        return "message";
    }

    private String firstText(String first, String second) {
        return first != null ? first : second;
    }

    private String text(JSONObject source, String key) {
        if (source == null) {
            return null;
        }
        Object value = source.get(key);
        if (!(value instanceof String text) || text.isBlank()) {
            return null;
        }
        return text;
    }
}
