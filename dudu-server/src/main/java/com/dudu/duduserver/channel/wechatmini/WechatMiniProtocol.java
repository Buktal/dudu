package com.dudu.duduserver.channel.wechatmini;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.support.Digests;
import com.dudu.duduserver.constant.MessageDirectionEnum;
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
 * 小程序回调协议（事实见 docs/research/channels/wechat-mini.md §3.2、§4、§5）：握手与明文
 * 推送用三参 sha1(字典序(token, timestamp, nonce) 拼接)；安全/兼容模式密文校验必须用四参
 * msg_signature——官方注意事项原文「注意：不要使用 signature 验证！」，URL 中的三参
 * signature 仅作并存，不参与密文校验。推送包按数据格式支持 XML 与 JSON（§3.1 二选一配置），
 * 客服会话仅 text/image/miniprogrampage 三包加进入会话事件（§2.1），按 MsgType 解析为契约
 * 第 4 节统一消息体；事件推送不产生访客消息，只由调用方应答。
 */
@Component
public class WechatMiniProtocol {

    // 小程序客服会话仅有的三种消息类型加事件
    private static final String MSG_TYPE_TEXT = "text";
    private static final String MSG_TYPE_IMAGE = "image";
    private static final String MSG_TYPE_MINI_PROGRAM_PAGE = "miniprogrampage";
    private static final String MSG_TYPE_EVENT = "event";

    /**
     * 三参验签：token/timestamp/nonce 字典序排序后拼接取 sha1 十六进制小写与渠道签名比对。
     */
    public boolean verify(String token, String signature, String timestamp, String nonce) {
        if (isBlank(token) || isBlank(signature) || isBlank(timestamp) || isBlank(nonce)) {
            return false;
        }
        String[] parts = {token, timestamp, nonce};
        Arrays.sort(parts);
        return signature.equalsIgnoreCase(Digests.sha1Hex(String.join("", parts)));
    }

    /**
     * 四参验签：token/timestamp/nonce/Encrypt（包体密文字段）字典序排序拼接取 sha1 与
     * msg_signature 比对；Encrypt 缺失或签名缺失都按校验失败处理。
     */
    public boolean verifySignature(String token, String msgSignature, String timestamp, String nonce,
                                   String encrypt) {
        if (isBlank(token) || isBlank(msgSignature) || isBlank(timestamp) || isBlank(nonce) || isBlank(encrypt)) {
            return false;
        }
        String[] parts = {token, timestamp, nonce, encrypt};
        Arrays.sort(parts);
        return msgSignature.equalsIgnoreCase(Digests.sha1Hex(String.join("", parts)));
    }

    /**
     * 解析推送报文：普通消息转为统一入站消息，事件推送返回空表示只应答不保存；报文无法
     * 解析或缺少发送方身份时抛出 {@link IllegalArgumentException}，由调用方按参数错误拒绝。
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
            blankToNull(fields.get("MsgId")),
            MessageDirectionEnum.INCOMING,
            content(msgType, fields));
        return Optional.of(inbound);
    }

    /**
     * 取加密信封中的密文字段（XML 与 JSON 信封同名为 Encrypt，§3.3/§5.2）；报文无法解析
     * 或没有密文时返回 null，由调用方按验签失败处理。
     */
    public String encryptOf(String body) {
        String trimmed = body == null ? "" : body.stripLeading();
        if (!trimmed.startsWith("{")) {
            try {
                return blankToNull(xmlFields(trimmed).get("Encrypt"));
            } catch (IllegalArgumentException e) {
                return null;
            }
        }
        try {
            return blankToNull(JSONUtil.parseObj(trimmed).getStr("Encrypt"));
        } catch (RuntimeException e) {
            return null;
        }
    }

    // 数据格式二选一（§3.1）：首字符 { 按 JSON 解析，其余按 XML 解析；只取根元素一级子元素
    private Map<String, String> fields(String body) {
        String trimmed = body == null ? "" : body.stripLeading();
        if (!trimmed.startsWith("{")) {
            return xmlFields(trimmed);
        }
        try {
            JSONObject payload = JSONUtil.parseObj(trimmed);
            Map<String, String> fields = new LinkedHashMap<>();
            for (String key : payload.keySet()) {
                fields.put(key, payload.getStr(key));
            }
            return fields;
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("渠道回调报文无法解析", e);
        }
    }

    // 禁止 DTD 与外部实体：回调报文来自公网，不解析实体引用
    private Map<String, String> xmlFields(String body) {
        Document document;
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setXIncludeAware(false);
            factory.setExpandEntityReferences(false);
            DocumentBuilder builder = factory.newDocumentBuilder();
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

    // 按 MsgType 映射统一消息体；渠道不提供的可选信息省略，无法映射的按 unknown 如实保存
    private Map<String, Object> content(String msgType, Map<String, String> fields) {
        try {
            return switch (msgType) {
                case MSG_TYPE_TEXT -> Map.of("type", "text", "text", fields.getOrDefault("Content", ""));
                case MSG_TYPE_IMAGE ->
                    media("image", msgType, fields.get("MediaId"), fields.get("PicUrl"), fields.get("MsgId"));
                case MSG_TYPE_MINI_PROGRAM_PAGE -> miniProgramCard(fields);
                default -> unknown(msgType);
            };
        } catch (RuntimeException e) {
            // 字段值不符合类型约定时如实落 unknown，不猜测内容
            return unknown(msgType);
        }
    }

    // 媒体标识取渠道 MediaId；只有公开链接时用「消息 ID:媒体下标」派生稳定标识；
    // 两者都没有时契约第 4 节要求媒体引用必有 id，没有可如实表达的引用，按 unknown 如实保存不填假值
    private Map<String, Object> media(String kind, String msgType, String mediaId, String url, String messageId) {
        String id = blankToNull(mediaId);
        if (id == null) {
            String messageScoped = blankToNull(messageId);
            if (messageScoped == null) {
                return unknown(msgType);
            }
            id = messageScoped + ":0";
        }
        Map<String, Object> media = new LinkedHashMap<>();
        media.put("kind", kind);
        media.put("id", id);
        String publicUrl = blankToNull(url);
        if (publicUrl != null) {
            media.put("url", publicUrl);
        }
        return Map.of("type", kind, "media", media);
    }

    // 小程序卡片映射 card：Title 进 title；PagePath 是小程序页内路径不是外链、ThumbMediaId
    // 是封面素材编号，都不映射为 url/externalId，避免 Desk 渲染出无法打开的来源链接
    private Map<String, Object> miniProgramCard(Map<String, String> fields) {
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("type", "card");
        content.put("kind", MSG_TYPE_MINI_PROGRAM_PAGE);
        String title = blankToNull(fields.get("Title"));
        if (title != null) {
            content.put("title", title);
        }
        return content;
    }

    private Map<String, Object> unknown(String msgType) {
        return Map.of("type", "unknown", "originalType", msgType.isEmpty() ? "unknown" : msgType);
    }

    private boolean isBlank(String value) {
        return value == null || value.isEmpty();
    }

    private String blankToNull(String value) {
        return value == null || value.isEmpty() ? null : value;
    }
}
