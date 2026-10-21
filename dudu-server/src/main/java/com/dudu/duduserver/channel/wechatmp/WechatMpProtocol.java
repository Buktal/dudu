package com.dudu.duduserver.channel.wechatmp;

import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.support.MessageBodies;
import com.dudu.duduserver.channel.support.SecureXml;
import com.dudu.duduserver.channel.support.Texts;
import com.dudu.duduserver.channel.support.WechatSignatures;
import com.dudu.duduserver.channel.support.WechatXmlBodies;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import org.springframework.stereotype.Component;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 微信公众号明文模式回调协议（事实见 docs/research/channels/wechat-mp.md）：
 * 握手与推送共用 sha1(字典序(token, timestamp, nonce) 拼接) 验签，推送报文仅 XML；
 * 按 MsgType 解析为契约第 4 节统一消息体。事件推送不产生访客消息，只由调用方应答；
 * 兼容/安全模式需要 EncodingAESKey 解密，本票未接入，由调用方按不支持处理。
 */
@Component
public class WechatMpProtocol {

    // 公众号普通消息的七种 MsgType
    private static final String MSG_TYPE_TEXT = "text";
    private static final String MSG_TYPE_IMAGE = "image";
    private static final String MSG_TYPE_VOICE = "voice";
    private static final String MSG_TYPE_VIDEO = "video";
    private static final String MSG_TYPE_SHORT_VIDEO = "shortvideo";
    private static final String MSG_TYPE_LOCATION = "location";
    private static final String MSG_TYPE_LINK = "link";
    private static final String MSG_TYPE_EVENT = "event";

    /**
     * 验签：token/timestamp/nonce 字典序排序后直接拼接取 sha1 十六进制小写，与渠道签名比对。
     */
    public boolean verify(String token, String signature, String timestamp, String nonce) {
        if (token == null || token.isEmpty() || signature == null || timestamp == null || nonce == null) {
            return false;
        }
        return WechatSignatures.verifySha1(signature, token, timestamp, nonce);
    }

    /**
     * 解析推送报文：普通消息转为统一入站消息，事件推送返回空表示只应答不保存；
     * 报文无法解析时抛出 {@link IllegalArgumentException}，由调用方按参数错误拒绝。
     */
    public Optional<ChannelInboundMessage> parse(Long companyChannelId, String body) {
        Map<String, String> fields = SecureXml.flatFields(body);
        String msgType = fields.getOrDefault("MsgType", "");
        if (MSG_TYPE_EVENT.equals(msgType)) {
            return Optional.empty();
        }
        String externalUserId = fields.getOrDefault("FromUserName", "");
        if (externalUserId.isEmpty()) {
            throw new IllegalArgumentException("渠道报文缺少发送方身份");
        }
        ChannelInboundMessage inbound = new ChannelInboundMessage(
            companyChannelId,
            externalUserId,
            null,
            null,
            List.of(),
            Texts.blankToNull(fields.get("MsgId")),
            MessageDirectionEnum.INCOMING,
            content(msgType, fields));
        return Optional.of(inbound);
    }

    // 按 MsgType 映射统一消息体；渠道不提供的可选信息省略，无法映射的按 unknown 如实保存
    private Map<String, Object> content(String msgType, Map<String, String> fields) {
        try {
            return switch (msgType) {
                case MSG_TYPE_TEXT -> Map.of("type", "text", "text", fields.getOrDefault("Content", ""));
                case MSG_TYPE_IMAGE -> WechatXmlBodies.media("image", msgType,
                    fields.get("MediaId"), fields.get("PicUrl"), fields.get("MsgId"));
                case MSG_TYPE_VOICE -> WechatXmlBodies.media("audio", msgType,
                    fields.get("MediaId"), null, fields.get("MsgId"));
                case MSG_TYPE_VIDEO, MSG_TYPE_SHORT_VIDEO -> WechatXmlBodies.media("video", msgType,
                    fields.get("MediaId"), null, fields.get("MsgId"));
                case MSG_TYPE_LOCATION -> WechatXmlBodies.location(fields);
                case MSG_TYPE_LINK -> WechatXmlBodies.link(fields);
                default -> MessageBodies.unknown(msgType);
            };
        } catch (RuntimeException e) {
            // 字段值不符合类型约定（如位置精度不是数字）时如实落 unknown，不猜测内容
            return MessageBodies.unknown(msgType);
        }
    }
}
