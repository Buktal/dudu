package com.dudu.duduserver.channel.xiaohongshu;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.channel.support.MessageBodies;
import com.dudu.duduserver.channel.support.Texts;
import com.dudu.duduserver.channel.support.WechatSignatures;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 小红书回调协议（事实见 docs/research/channels/xiaohongshu.md §10、§11）：握手为 GET
 * query 四参数（signature/timestamp/nonce/echostr），三参验签 sha1(字典序(token, timestamp,
 * nonce) 拼接)；加密推送的签名材料在 body 信封内（§11.2），四参验签 sha1(字典序(token,
 * timestamp, nonce, Encrypt) 拼接)。客服消息载荷为 JSON（§10.3 五型：text/image/video/
 * item/order），按契约第 4 节映射统一消息体；image/video 只有公开链接，媒体标识按
 * 「消息 ID:0」派生；item/order 映射 card.externalId；事件回调族（§10.7）与无法识别的推送
 * 不产生访客消息，返回空表示调用方只应答 success；可识别消息缺发送方身份按参数错误拒绝。
 */
@Component
public class XiaohongshuProtocol {

    // 客服消息五型（§10.3）；其余 MsgType 与事件回调族只应答
    private static final String MSG_TYPE_TEXT = "text";
    private static final String MSG_TYPE_IMAGE = "image";
    private static final String MSG_TYPE_VIDEO = "video";
    private static final String MSG_TYPE_ITEM = "item";
    private static final String MSG_TYPE_ORDER = "order";

    private static final String FIELD_MSG_ID = "MsgId";
    private static final String FIELD_FROM_OPEN_ID = "FromOpenId";
    private static final String FIELD_MSG_TYPE = "MsgType";
    private static final String FIELD_CONTENT = "Content";
    private static final String FIELD_PIC_URL = "PicUrl";
    private static final String FIELD_VIDEO_URL = "VideoUrl";
    private static final String FIELD_OUT_PRODUCT_ID = "OutProductId";
    private static final String FIELD_OUT_ORDER_ID = "OutOrderId";

    /**
     * 三参验签：token/timestamp/nonce 字典序排序后拼接取 sha1 十六进制小写与渠道签名比对
     * （§10.4 握手）。
     */
    public boolean verify(String token, String signature, String timestamp, String nonce) {
        if (Texts.isBlank(token) || Texts.isBlank(signature) || Texts.isBlank(timestamp) || Texts.isBlank(nonce)) {
            return false;
        }
        return WechatSignatures.verifySha1(signature, token, timestamp, nonce);
    }

    /**
     * 四参验签：token/timestamp/nonce/Encrypt 字典序排序拼接取 sha1 与信封 MsgSignature
     * 比对（§11.3 官方 MsgSignature.getSignature）；Encrypt 缺失或签名缺失都按校验失败处理。
     */
    public boolean verifySignature(String token, String msgSignature, String timestamp, String nonce,
                                   String encrypt) {
        if (Texts.isBlank(token) || Texts.isBlank(msgSignature) || Texts.isBlank(timestamp) || Texts.isBlank(nonce) || Texts.isBlank(encrypt)) {
            return false;
        }
        return WechatSignatures.verifySha1(msgSignature, token, timestamp, nonce, encrypt);
    }

    /**
     * 解析加密信封（§11.2）：Nonce/Timestamp/Encrypt/MsgSignature 四字段齐全才返回信封，
     * body 缺失、无法解析或字段不齐返回 null，由调用方按验签失败处理。
     */
    public XiaohongshuEnvelope envelopeOf(String body) {
        if (body == null) {
            return null;
        }
        try {
            JSONObject payload = JSONUtil.parseObj(body);
            XiaohongshuEnvelope envelope = new XiaohongshuEnvelope(
                Texts.blankToNull(payload.getStr("Nonce")),
                Texts.blankToNull(payload.getStr("Timestamp")),
                Texts.blankToNull(payload.getStr("Encrypt")),
                Texts.blankToNull(payload.getStr("MsgSignature")));
            return envelope.nonce() == null || envelope.timestamp() == null
                || envelope.encrypt() == null || envelope.msgSignature() == null ? null : envelope;
        } catch (RuntimeException e) {
            return null;
        }
    }

    /**
     * 解析明文推送：客服消息五型转为统一入站消息；事件回调族、未知 MsgType 与无法解析的
     * 推送（如混入的其他体系信封）返回空表示只应答不保存；可识别消息缺少发送方身份时抛出
     * {@link IllegalArgumentException}，由调用方按参数错误拒绝。
     */
    public Optional<ChannelInboundMessage> parse(Long companyChannelId, String plaintext) {
        Map<String, String> fields = fields(plaintext);
        String msgType = fields.getOrDefault(FIELD_MSG_TYPE, "");
        if (!isKnownMsgType(msgType)) {
            // 事件回调族与无法识别的推送只应答不保存
            return Optional.empty();
        }
        String externalUserId = fields.getOrDefault(FIELD_FROM_OPEN_ID, "");
        if (externalUserId.isEmpty()) {
            // 可识别的客服消息缺发送方身份无法归属会话，按参数错误拒绝
            throw new IllegalArgumentException("渠道报文缺少发送方身份");
        }
        ChannelInboundMessage inbound = new ChannelInboundMessage(
            companyChannelId,
            externalUserId,
            null,
            null,
            List.of(),
            Texts.blankToNull(fields.get(FIELD_MSG_ID)),
            MessageDirectionEnum.INCOMING,
            content(msgType, fields));
        return Optional.of(inbound);
    }

    // 信封四字段（§11.2）：都在 body 的 JSON 内
    private Map<String, String> fields(String plaintext) {
        if (plaintext == null) {
            return Map.of();
        }
        try {
            JSONObject payload = JSONUtil.parseObj(plaintext);
            Map<String, String> fields = new LinkedHashMap<>();
            for (String key : payload.keySet()) {
                fields.put(key, payload.getStr(key));
            }
            return fields;
        } catch (RuntimeException e) {
            // 明文无法按 JSON 解析：验签已通过，按「非客服消息推送」只应答不保存
            return Map.of();
        }
    }

    // 按 MsgType 映射统一消息体；字段值不符合类型约定时如实落 unknown，不猜测内容
    private Map<String, Object> content(String msgType, Map<String, String> fields) {
        return switch (msgType) {
            case MSG_TYPE_TEXT -> Map.of("type", "text", "text", fields.getOrDefault(FIELD_CONTENT, ""));
            case MSG_TYPE_IMAGE -> media("image", fields, FIELD_PIC_URL);
            case MSG_TYPE_VIDEO -> media("video", fields, FIELD_VIDEO_URL);
            case MSG_TYPE_ITEM -> card(MSG_TYPE_ITEM, fields.get(FIELD_OUT_PRODUCT_ID));
            case MSG_TYPE_ORDER -> card(MSG_TYPE_ORDER, fields.get(FIELD_OUT_ORDER_ID));
            default -> MessageBodies.unknown(msgType);
        };
    }

    // 小红书不提供媒体编号，只有公开链接：标识按「消息 ID:0」派生（契约第 4 节）；连消息 ID
    // 都没有时没有可如实表达的引用，按 unknown 保存不填假值
    private Map<String, Object> media(String kind, Map<String, String> fields, String urlField) {
        String messageId = Texts.blankToNull(fields.get(FIELD_MSG_ID));
        if (messageId == null) {
            return MessageBodies.unknown(kind);
        }
        return MessageBodies.media(kind, messageId + ":0", fields.get(urlField), null);
    }

    // item/order 映射 card：kind 记录推送类型，externalId 为外部商品/订单标识
    private Map<String, Object> card(String kind, String externalId) {
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("type", "card");
        content.put("kind", kind);
        if (externalId != null && !externalId.isEmpty()) {
            content.put("externalId", externalId);
        }
        return content;
    }

    private boolean isKnownMsgType(String msgType) {
        return MSG_TYPE_TEXT.equals(msgType) || MSG_TYPE_IMAGE.equals(msgType) || MSG_TYPE_VIDEO.equals(msgType)
            || MSG_TYPE_ITEM.equals(msgType) || MSG_TYPE_ORDER.equals(msgType);
    }
}
