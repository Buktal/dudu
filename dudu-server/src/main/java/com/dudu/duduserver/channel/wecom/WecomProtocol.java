package com.dudu.duduserver.channel.wecom;

import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.support.AesEnvelopeCodec;
import com.dudu.duduserver.channel.support.Digests;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.channel.support.Texts;
import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;

import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 企业微信回调协议（事实见 docs/research/channels/wecom.md）：验签为 token/timestamp/
 * nonce/密文四值字典序拼接的 SHA-1 40 位小写 hex；AES 信封（AESKey =
 * Base64Decode(EncodingAESKey + "=")、AES-256-CBC、IV 取 key 前 16 字节、PKCS#7 按
 * 32 字节块补位、密文结构 random(16B) + msg_len(4B 大端) + msg + receiveid）收敛到
 * {@link AesEnvelopeCodec} 统一口径，receiveid（企业应用回调即 corpId）解密后由调用方
 * 校验。官方 §5.1 黄金向量为验收基准；encrypt 当前供测试按黄金向量构造对拍报文。
 */
@Component
public class WecomProtocol {

    // 企微普通消息的六种 MsgType 与事件推送（官方 90239/90240）
    private static final String MSG_TYPE_TEXT = "text";
    private static final String MSG_TYPE_IMAGE = "image";
    private static final String MSG_TYPE_VOICE = "voice";
    private static final String MSG_TYPE_VIDEO = "video";
    private static final String MSG_TYPE_LOCATION = "location";
    private static final String MSG_TYPE_LINK = "link";
    private static final String MSG_TYPE_EVENT = "event";

    /**
     * 解析解密后的明文报文（官方 §2.1 普通消息与 §2.2 事件推送）：普通消息转为统一入站
     * 消息，事件推送返回空表示只应答不落库；报文无法解析或缺少发送方身份时抛出
     * {@link IllegalArgumentException}，由调用方按参数错误拒绝。
     */
    public Optional<ChannelInboundMessage> parse(Long companyChannelId, String xml) {
        Map<String, String> fields = fields(xml);
        String msgType = fields.getOrDefault("MsgType", "");
        if (MSG_TYPE_EVENT.equals(msgType)) {
            return Optional.empty();
        }
        String externalUserId = fields.getOrDefault("FromUserName", "");
        if (externalUserId.isEmpty()) {
            throw new IllegalArgumentException("渠道报文缺少发送方身份");
        }
        return Optional.of(new ChannelInboundMessage(
            companyChannelId,
            externalUserId,
            null,
            null,
            List.of(),
            Texts.blankToNull(fields.get("MsgId")),
            MessageDirectionEnum.INCOMING,
            content(msgType, fields)));
    }

    /**
     * 提取加密信封（官方 §3.3/§5.1：ToUserName/Encrypt/AgentID 三字段）中的密文；
     * 信封无法解析或缺少 Encrypt 时抛出 {@link IllegalArgumentException}。
     */
    public String envelopeEncrypt(String envelope) {
        String encrypt = fields(envelope).get("Encrypt");
        if (encrypt == null || encrypt.isEmpty()) {
            throw new IllegalArgumentException("回调信封缺少 Encrypt 密文");
        }
        return encrypt;
    }

    // 报文只取 <xml> 根元素的一级子元素，嵌套结构不参与消息体；XML 解析不假设严格 CDATA
    private Map<String, String> fields(String xml) {
        Document document;
        try {
            DocumentBuilder builder = secureBuilder();
            document = builder.parse(new InputSource(new StringReader(xml)));
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

    // 按 MsgType 映射契约第 4 节统一消息体；渠道不提供的可选信息省略，无法映射的按 unknown 如实保存
    private Map<String, Object> content(String msgType, Map<String, String> fields) {
        try {
            return switch (msgType) {
                case MSG_TYPE_TEXT -> Map.of("type", "text", "text", fields.getOrDefault("Content", ""));
                case MSG_TYPE_IMAGE ->
                    media("image", msgType, fields.get("MediaId"), fields.get("PicUrl"), fields.get("MsgId"));
                case MSG_TYPE_VOICE -> media("audio", msgType, fields.get("MediaId"), null, fields.get("MsgId"));
                case MSG_TYPE_VIDEO -> media("video", msgType, fields.get("MediaId"), null, fields.get("MsgId"));
                case MSG_TYPE_LOCATION -> location(fields);
                case MSG_TYPE_LINK -> link(fields);
                default -> unknown(msgType);
            };
        } catch (RuntimeException e) {
            // 字段值不符合类型约定（如位置精度不是数字）时如实落 unknown，不猜测内容
            return unknown(msgType);
        }
    }

    // 媒体标识取渠道 MediaId；缺失时用「消息 ID:媒体下标」派生稳定标识（契约第 4 节）；
    // 两者都没有时没有可如实表达的引用，按 unknown 如实保存不填假值
    private Map<String, Object> media(String kind, String msgType, String mediaId, String url, String messageId) {
        String id = Texts.blankToNull(mediaId);
        if (id == null) {
            String messageScoped = Texts.blankToNull(messageId);
            if (messageScoped == null) {
                return unknown(msgType);
            }
            id = messageScoped + ":0";
        }
        Map<String, Object> media = new LinkedHashMap<>();
        media.put("kind", kind);
        media.put("id", id);
        String publicUrl = Texts.blankToNull(url);
        if (publicUrl != null) {
            media.put("url", publicUrl);
        }
        return Map.of("type", kind, "media", media);
    }

    // 官方定义 Location_X 为纬度、Location_Y 为经度
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

    /**
     * 验签：token/timestamp/nonce/密文四值字典序排序拼接取 SHA-1 40 位小写 hex，与渠道
     * 签名比对（官方 §4.2；材料全在 URL query 与密文本体）。
     */
    public boolean verify(String token, String signature, String timestamp, String nonce, String msgEncrypt) {
        if (token == null || token.isEmpty() || signature == null || timestamp == null || nonce == null
            || msgEncrypt == null) {
            return false;
        }
        String[] parts = {token, timestamp, nonce, msgEncrypt};
        Arrays.sort(parts);
        return signature.equalsIgnoreCase(Digests.sha1Hex(String.join("", parts)));
    }

    /**
     * 解密结果：明文报文 XML 与尾部 receiveid（企业应用回调即 corpId，须由调用方校验）。
     */
    public record Decrypted(String xml, String receiveid) {
    }

    /**
     * 解密密文（官方 §4.3 逆过程）：信封骨架（43 位 EncodingAESKey 解码、AES-256-CBC、
     * IV 取 key 前 16 字节、32 字节块 PKCS#7、random+msg_len+msg+receiveid 结构）收敛到
     * {@link AesEnvelopeCodec} 统一口径；receiveid（企业应用回调即 corpId）不在此校验，
     * 原样交调用方比对。密文或 EncodingAESKey 不合法时抛出
     * {@link IllegalArgumentException}，由调用方按参数错误拒绝。
     */
    public Decrypted decrypt(String encodingAesKey, String msgEncrypt) {
        AesEnvelopeCodec.Plain plain = AesEnvelopeCodec.decrypt(
            AesEnvelopeCodec.decodeKey(encodingAesKey), msgEncrypt, null);
        return new Decrypted(plain.message(), plain.receiveId());
    }

    /**
     * 加密（官方 §4.3，解密的逆过程）：拼接 random(16B) + msg_len(4B 大端) + msg +
     * receiveid 后 AES 加密再 Base64。当前仅测试按黄金向量构造对拍报文使用。
     */
    public String encrypt(String encodingAesKey, byte[] random16, byte[] xml, String receiveid) {
        return AesEnvelopeCodec.encrypt(AesEnvelopeCodec.decodeKey(encodingAesKey), random16, xml,
            receiveid.getBytes(StandardCharsets.UTF_8));
    }
}
