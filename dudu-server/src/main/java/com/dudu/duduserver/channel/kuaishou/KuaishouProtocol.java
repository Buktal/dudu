package com.dudu.duduserver.channel.kuaishou;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.support.Digests;
import com.dudu.duduserver.channel.support.MessageBodies;
import com.dudu.duduserver.channel.support.Texts;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 快手智能客服回调协议（事实见 docs/research/channels/kuaishou.md §6.5.3）：推送为
 * POST 明文 JSON（推送地址线下报备，无 GET 握手），验签 Header Ks-Sign =
 * MD5(appKey + 原始 body)，事件类型另见 Ks-Event-Type 头；应答体由快手侧定义为
 * {@code {"result":1}}。买家→商家消息（type=1）转为统一入站消息——访客身份取
 * fromUser.openId、名称取 nickName，requestId 作幂等消息标识；心跳（{"test":true}）
 * 与转接/辅助应答类事件（type!=1）返回空表示只应答不落库；报文无法解析或可识别
 * 消息缺少必填身份时抛出 {@link IllegalArgumentException}，由调用方按参数错误拒绝。
 */
@Component
public class KuaishouProtocol {

    // 渠道要求应答体（§6.5.3 逐字 {"result": 1}，JSON 紧凑形态等价）
    public static final String ACK_BODY = "{\"result\":1}";

    // 收发共用报文字段（§6.5.2 发送入参与 §6.5.3 推送同名字段，语义一致），包内共享
    static final String KEY_REQUEST_ID = "requestId";
    static final String KEY_TYPE = "type";
    static final String KEY_FROM_USER = "fromUser";
    static final String KEY_NICK_NAME = "nickName";
    static final String KEY_CONTENT_TYPE = "contentType";
    static final String KEY_CONTENT = "content";
    // 文本 content 载荷内层字段（§6.5.2：{"text": "...", "hintTag": {...}}）
    static final String KEY_TEXT = "text";
    // type 枚举（§6.5.2/§6.5.3）：1 消息、2 转接、4 辅助模式下无法应答
    static final int TYPE_MESSAGE = 1;
    // message.contentType 枚举（§6.5.2）：1 文本、2 图片（uri 被平台抹空）、
    // 1011 商品卡片、1012 订单卡片
    static final int CONTENT_TYPE_TEXT = 1;

    // 推送独有 body 字段（§6.5.3 逐字表）
    private static final String KEY_TEST = "test";
    private static final String KEY_MESSAGE = "message";
    private static final String KEY_OPEN_ID = "openId";

    // 推送独有 contentType 枚举（§6.5.2）：2 图片（uri 被平台抹空）、
    // 1011 商品卡片、1012 订单卡片
    private static final int CONTENT_TYPE_IMAGE = 2;
    private static final int CONTENT_TYPE_ITEM = 1011;
    private static final int CONTENT_TYPE_ORDER = 1012;

    // 统一消息体 card kind：与小红书 item/order 卡片同构（契约第 4 节）
    private static final String KIND_ITEM = "item";
    private static final String KIND_ORDER = "order";

    /**
     * 验签（§6.5.3 逐字）：Ks-Sign = MD5(appKey + 原始 body 字符串)，常量时间比对；
     * 凭据或签名缺失、不符一律 false，由调用方按验签拒绝处理。
     */
    public boolean verify(KuaishouCredentials credentials, String sign, String body) {
        if (credentials == null || Texts.isBlank(sign)) {
            return false;
        }
        return Digests.constantTimeEquals(Digests.md5Hex(credentials.appKey() + (body == null ? "" : body)), sign);
    }

    /**
     * 解析推送：type=1 的买家消息转为统一入站消息；心跳与转接/辅助类事件返回空表示只
     * 应答不落库。报文无法解析、缺少必填的访客身份（fromUser.openId）或幂等标识
     * （requestId）时抛出 {@link IllegalArgumentException}，由调用方按参数错误拒绝。
     */
    public Optional<ChannelInboundMessage> parse(Long companyChannelId, String body) {
        JSONObject push;
        try {
            push = JSONUtil.parseObj(body);
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("快手推送报文无法解析", e);
        }
        // 心跳（§6.2 推送基座机制）：只应答
        if (push.getBool(KEY_TEST, false)) {
            return Optional.empty();
        }
        Integer type = push.getInt(KEY_TYPE, null);
        if (type == null || type != TYPE_MESSAGE) {
            // 转接（2）与辅助模式无法应答（4）等事件不是访客消息
            return Optional.empty();
        }
        JSONObject fromUser = push.getJSONObject(KEY_FROM_USER);
        String externalUserId = fromUser == null ? null : Texts.blankToNull(fromUser.getStr(KEY_OPEN_ID, null));
        if (externalUserId == null) {
            throw new IllegalArgumentException("快手推送缺少发送方身份 fromUser.openId");
        }
        String requestId = Texts.blankToNull(push.getStr(KEY_REQUEST_ID, null));
        if (requestId == null) {
            // requestId 是推送幂等标识：缺失落库会失去去重依据，按参数错误拒绝
            throw new IllegalArgumentException("快手推送缺少幂等标识 requestId");
        }
        JSONObject message = push.getJSONObject(KEY_MESSAGE);
        if (message == null) {
            throw new IllegalArgumentException("快手推送缺少消息体 message");
        }
        return Optional.of(new ChannelInboundMessage(companyChannelId, externalUserId,
            visitorName(fromUser), null, List.of(), requestId, MessageDirectionEnum.INCOMING,
            unifiedBody(message)));
    }

    // 访客名称：fromUser.nickName（缺失如实省略，不覆盖库中已有值）
    private String visitorName(JSONObject fromUser) {
        return Texts.blankToNull(fromUser.getStr(KEY_NICK_NAME, null));
    }

    // 按 contentType 映射统一消息体；无法映射或载荷异常的按 unknown 如实保存
    private Map<String, Object> unifiedBody(JSONObject message) {
        Integer contentType = message.getInt(KEY_CONTENT_TYPE, null);
        if (contentType == null) {
            return MessageBodies.unknown("unknown");
        }
        String content = message.getStr(KEY_CONTENT, "");
        return switch (contentType) {
            case CONTENT_TYPE_TEXT -> text(content, contentType);
            case CONTENT_TYPE_IMAGE -> MessageBodies.unknown("image");
            // 商品卡片：content 为 {"text": "$itemId"}，text 值即商品标识（保留官方 $ 前缀形态）
            case CONTENT_TYPE_ITEM -> card(KIND_ITEM, textValueOf(content));
            case CONTENT_TYPE_ORDER -> card(KIND_ORDER, orderIdOf(content));
            default -> MessageBodies.unknown(String.valueOf(contentType));
        };
    }

    // 文本消息：content 为 JSON 字符串 {"text": "...", "hintTag": {...}}，取 text；
    // 载荷无法解析或缺少 text 时按 unknown 如实保存（不猜内容）
    private Map<String, Object> text(String content, int contentType) {
        try {
            JSONObject payload = JSONUtil.parseObj(content);
            String text = payload.getStr(KEY_TEXT, null);
            if (text == null) {
                return MessageBodies.unknown(String.valueOf(contentType));
            }
            return Map.of("type", "text", KEY_TEXT, text);
        } catch (RuntimeException e) {
            return MessageBodies.unknown(String.valueOf(contentType));
        }
    }

    // 订单卡片：content 为 {"orderId": "12345"}
    private String orderIdOf(String content) {
        JSONObject payload = parseOrNull(content);
        return payload == null ? null : Texts.blankToNull(payload.getStr("orderId", null));
    }

    private String textValueOf(String content) {
        JSONObject payload = parseOrNull(content);
        return payload == null ? null : Texts.blankToNull(payload.getStr(KEY_TEXT, null));
    }

    private JSONObject parseOrNull(String content) {
        if (Texts.isBlank(content)) {
            return null;
        }
        try {
            return JSONUtil.parseObj(content);
        } catch (RuntimeException e) {
            return null;
        }
    }

    // 卡片分支：externalId 缺失时不填假值，kind 保留语义名供 Desk 展示
    private Map<String, Object> card(String kind, String externalId) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("type", "card");
        body.put("kind", kind);
        if (externalId != null) {
            body.put("externalId", externalId);
        }
        return body;
    }
}
