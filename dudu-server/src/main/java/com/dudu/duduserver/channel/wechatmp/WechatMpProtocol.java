package com.dudu.duduserver.channel.wechatmp;

import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.support.Digests;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.channel.support.MediaMessages;
import com.dudu.duduserver.channel.support.Texts;
import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.StringReader;
import java.util.Arrays;
import java.util.LinkedHashMap;
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
        String[] parts = {token, timestamp, nonce};
        Arrays.sort(parts);
        return signature.equalsIgnoreCase(Digests.sha1Hex(String.join("", parts)));
    }

    /**
     * 解析推送报文：普通消息转为统一入站消息，事件推送返回空表示只应答不保存；
     * 报文无法解析时抛出 {@link IllegalArgumentException}，由调用方按参数错误拒绝。
     */
    public Optional<ChannelInboundMessage> parse(Long companyChannelId, String body) {
        Map<String, String> fields = fields(body);
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

    // 报文只取 <xml> 根元素的一级子元素，嵌套结构（如 ScanCodeInfo）不参与消息体
    private Map<String, String> fields(String body) {
        Document document;
        try {
            DocumentBuilder builder = secureBuilder();
            document = builder.parse(new InputSource(new StringReader(body)));
        } catch (Exception e) {
            throw new IllegalArgumentException("渠道回调报文无法解析", e);
        }
        Map<String, String> fields = new LinkedHashMap<>();
        NodeList children = document.getDocumentElement().getChildNodes();
        for (int index = 0; index < children.getLength(); index++) {
            Node child = children.item(index);
            if (child.getNodeType() == Node.ELEMENT_NODE) {
                fields.put(child.getNodeName(), child.getTextContent());
            }
        }
        return fields;
    }

    // 禁止 DTD 与外部实体：回调报文来自公网，不解析实体引用
    private DocumentBuilder secureBuilder() throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);
        return factory.newDocumentBuilder();
    }

    // 按 MsgType 映射统一消息体；渠道不提供的可选信息省略，无法映射的按 unknown 如实保存
    private Map<String, Object> content(String msgType, Map<String, String> fields) {
        try {
            return switch (msgType) {
                case MSG_TYPE_TEXT -> Map.of("type", "text", "text", fields.getOrDefault("Content", ""));
                case MSG_TYPE_IMAGE ->
                    media("image", msgType, fields.get("MediaId"), fields.get("PicUrl"), fields.get("MsgId"));
                case MSG_TYPE_VOICE -> media("audio", msgType, fields.get("MediaId"), null, fields.get("MsgId"));
                case MSG_TYPE_VIDEO, MSG_TYPE_SHORT_VIDEO ->
                    media("video", msgType, fields.get("MediaId"), null, fields.get("MsgId"));
                case MSG_TYPE_LOCATION -> location(fields);
                case MSG_TYPE_LINK -> link(fields);
                default -> unknown(msgType);
            };
        } catch (RuntimeException e) {
            // 字段值不符合类型约定（如位置精度不是数字）时如实落 unknown，不猜测内容
            return unknown(msgType);
        }
    }

    // 媒体标识取渠道 MediaId；只有公开链接时用「消息 ID:媒体下标」派生稳定标识；
    // 两者都没有时契约第 4 节要求媒体引用必有 id，没有可如实表达的引用，按 unknown 如实保存不填假值
    private Map<String, Object> media(String kind, String msgType, String mediaId, String url, String messageId) {
        String id = Texts.blankToNull(mediaId);
        if (id == null) {
            String messageScoped = Texts.blankToNull(messageId);
            if (messageScoped == null) {
                return unknown(msgType);
            }
            id = messageScoped + ":0";
        }
        return MediaMessages.of(kind, id, url, null);
    }

    // 公众号定义 Location_X 为纬度、Location_Y 为经度
    private Map<String, Object> location(Map<String, String> fields) {
        String label = fields.get("Label");
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("type", "location");
        if (label != null && !label.isEmpty()) {
            content.put("label", label);
        }
        content.put("latitude", Double.parseDouble(fields.get("Location_X")));
        content.put("longitude", Double.parseDouble(fields.get("Location_Y")));
        return content;
    }

    private Map<String, Object> link(Map<String, String> fields) {
        String url = Texts.blankToNull(fields.get("Url"));
        if (url == null) {
            return unknown(MSG_TYPE_LINK);
        }
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("type", "link");
        String title = Texts.blankToNull(fields.get("Title"));
        if (title != null) {
            content.put("title", title);
        }
        content.put("url", url);
        String description = Texts.blankToNull(fields.get("Description"));
        if (description != null) {
            content.put("description", description);
        }
        return content;
    }

    private Map<String, Object> unknown(String msgType) {
        return Map.of("type", "unknown", "originalType", msgType.isEmpty() ? "unknown" : msgType);
    }

    private String blankToNull(String value) {
        return value == null || value.isEmpty() ? null : value;
    }
}
