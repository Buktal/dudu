package com.dudu.duduserver.channel.dingtalk;

import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.channel.support.MessageBodies;
import com.dudu.duduserver.channel.support.Texts;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 钉钉新 HTTP 密文体系协议（事实库 §3.2/§5.1/§5.6/§5.11）：解密明文分两类——
 * 大写 EventType 事件信封（含 check_url/check_create_suite_url/check_update_suite_url
 * 握手族）只应答不落库；小写 msgtype 机器人消息按六种 msgtype 映射契约第 4 节统一
 * 消息体。success 回包四字段加密 echo 请求带来的 timestamp/nonce（中文
 * configure-http-push 页 getEncryptedMap 四参原文背书），1500ms 应答窗由入口承担。
 */
@Component
public class DingtalkProtocol {

    // 机器人消息的六种 msgtype（事实库 §5.1/§5.11）
    private static final String MSG_TYPE_TEXT = "text";
    private static final String MSG_TYPE_PICTURE = "picture";
    private static final String MSG_TYPE_AUDIO = "audio";
    private static final String MSG_TYPE_VIDEO = "video";
    private static final String MSG_TYPE_FILE = "file";
    private static final String MSG_TYPE_RICH_TEXT = "richText";

    // 解密明文的路由键：事件信封 EventType（大写）与机器人消息 msgtype（小写）
    private static final String KEY_EVENT_TYPE = "EventType";
    private static final String KEY_MSG_TYPE = "msgtype";

    /**
     * 构造加密 success 回包：encrypt 加密明文 success，签名以回包自身四参重算，
     * timeStamp/nonce 原样取请求带来的值。
     *
     * @param token     回调加解密 Token
     * @param timestamp 请求携带的时间戳
     * @param nonce     请求携带的随机串
     * @param aesKeyB64 EncodingAESKey（43 位）
     * @param ownerKey  期望 ownerKey
     * @return 回包 JSON 字符串
     */
    public String successReply(String token, String timestamp, String nonce, String aesKeyB64, String ownerKey) {
        String encrypt = DingtalkCrypto.encrypt("success", aesKeyB64, ownerKey);
        JSONObject reply = new JSONObject(true);
        reply.set("msg_signature", DingtalkCrypto.buildSignature(token, timestamp, nonce, encrypt));
        reply.set("timeStamp", timestamp);
        reply.set("nonce", nonce);
        reply.set("encrypt", encrypt);
        return reply.toString();
    }

    /**
     * 判定解密明文是否为事件信封（EventType 路由）：事件只应答不落库。
     *
     * @param plaintext 解密后明文
     * @return 是否事件信封
     */
    public boolean isEvent(String plaintext) {
        return JSONUtil.isTypeJSONObject(plaintext) && JSONUtil.parseObj(plaintext).containsKey(KEY_EVENT_TYPE);
    }

    /**
     * 解析机器人消息明文为统一入站消息；事件信封与无 msgtype 的明文返回空表示只应答；
     * 非 JSON 明文或缺少发送方身份抛出 {@link IllegalArgumentException}，由调用方按
     * 参数错误拒绝。
     *
     * @param companyChannelId 渠道账号标识
     * @param plaintext        解密后明文
     * @return 统一入站消息
     */
    public Optional<ChannelInboundMessage> parse(Long companyChannelId, String plaintext) {
        if (!JSONUtil.isTypeJSONObject(plaintext)) {
            throw new IllegalArgumentException("渠道回调报文无法解析");
        }
        JSONObject fields = JSONUtil.parseObj(plaintext);
        String msgType = fields.getStr(KEY_MSG_TYPE, "");
        if (msgType.isEmpty()) {
            return Optional.empty();
        }
        String senderId = fields.getStr("senderId", "");
        if (senderId.isEmpty()) {
            throw new IllegalArgumentException("渠道报文缺少发送方身份");
        }
        ChannelInboundMessage inbound = new ChannelInboundMessage(
            companyChannelId,
            senderId,
            Texts.blankToNull(fields.getStr("senderNick")),
            null,
            List.of(),
            Texts.blankToNull(fields.getStr("msgId")),
            MessageDirectionEnum.INCOMING,
            content(msgType, fields));
        return Optional.of(inbound);
    }

    // 按 msgtype 映射统一消息体；媒体取 content.downloadCode 作渠道标识，
    // 缺 downloadCode 或字段形态异常时按 unknown 如实保存，不猜内容
    private Map<String, Object> content(String msgType, JSONObject fields) {
        try {
            JSONObject payload = fields.getJSONObject("content");
            JSONObject text = fields.getJSONObject("text");
            return switch (msgType) {
                case MSG_TYPE_TEXT -> Map.of("type", "text", "text", text == null ? "" : text.getStr("content", ""));
                case MSG_TYPE_PICTURE -> media("image", msgType, payload);
                case MSG_TYPE_AUDIO -> media("audio", msgType, payload);
                case MSG_TYPE_VIDEO -> media("video", msgType, payload);
                case MSG_TYPE_FILE -> media("file", msgType, payload);
                case MSG_TYPE_RICH_TEXT -> richText(payload);
                default -> MessageBodies.unknown(msgType);
            };
        } catch (RuntimeException e) {
            return MessageBodies.unknown(msgType);
        }
    }

    // 媒体标识取渠道 downloadCode；没有可如实表达的渠道标识时按 unknown 不填假值
    private Map<String, Object> media(String kind, String msgType, JSONObject payload) {
        String downloadCode = payload == null ? null : Texts.blankToNull(payload.getStr("downloadCode"));
        if (downloadCode == null) {
            return MessageBodies.unknown(msgType);
        }
        return MessageBodies.media(kind, downloadCode, null, payload.getStr("fileName"));
    }

    // 富文本：文本段顺序拼接；有图片等附件段落时按契约 reply 分支，否则退化为纯文本
    private Map<String, Object> richText(JSONObject payload) {
        List<Map<String, Object>> attachments = new ArrayList<>();
        StringBuilder text = new StringBuilder();
        if (payload != null) {
            JSONArray segments = payload.getJSONArray("richText");
            for (int index = 0; segments != null && index < segments.size(); index++) {
                JSONObject segment = segments.getJSONObject(index);
                if (segment == null) {
                    continue;
                }
                String downloadCode = Texts.blankToNull(segment.getStr("downloadCode"));
                if (downloadCode != null) {
                    Map<String, Object> attachment = new LinkedHashMap<>();
                    attachment.put("kind", attachmentKind(segment.getStr("type")));
                    attachment.put("id", downloadCode);
                    attachments.add(attachment);
                } else {
                    text.append(segment.getStr("text", ""));
                }
            }
        }
        if (attachments.isEmpty()) {
            return Map.of("type", "text", "text", text.toString());
        }
        return Map.of("type", "reply", "text", text.toString(), "attachments", attachments);
    }

    // 附件段落 type 按契约词表归一：picture→image，audio/video 同名，其余按文件
    private String attachmentKind(String segmentType) {
        return switch (segmentType == null ? "" : segmentType) {
            case "picture" -> "image";
            case "audio", "video" -> segmentType;
            default -> "file";
        };
    }
}
