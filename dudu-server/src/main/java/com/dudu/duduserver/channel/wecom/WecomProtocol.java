package com.dudu.duduserver.channel.wecom;

import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 企业微信回调协议的加解密原语（事实见 docs/research/channels/wecom.md §4）：
 * 签名为 token/timestamp/nonce/密文四值字典序拼接的 SHA-1 40 位小写 hex；AESKey =
 * Base64Decode(EncodingAESKey + "=")，AES-256-CBC、IV 取 key 前 16 字节、PKCS#7 按
 * 32 字节块补位（不是常见 AES 的 16）；密文结构 random(16B) + msg_len(4B 大端) + msg
 * + receiveid（企业应用回调即 corpId，解密后由调用方校验）。官方 §5.1 黄金向量为验收
 * 基准；encrypt 当前供测试按黄金向量构造对拍报文。
 */
@Component
public class WecomProtocol {

    // 企微补位块大小：RFC 2315 语义下的 32 字节（官方 §4.1，不是常见 AES 的 16）
    private static final int PAD_BLOCK = 32;

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
            blankToNull(fields.get("MsgId")),
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
        String url = blankToNull(fields.get("Url"));
        if (url == null) {
            return unknown(MSG_TYPE_LINK);
        }
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("type", "link");
        String title = blankToNull(fields.get("Title"));
        if (title != null) {
            content.put("title", title);
        }
        content.put("url", url);
        String description = blankToNull(fields.get("Description"));
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
        return signature.equalsIgnoreCase(sha1Hex(String.join("", parts)));
    }

    /**
     * 解密结果：明文报文 XML 与尾部 receiveid（企业应用回调即 corpId，须由调用方校验）。
     */
    public record Decrypted(String xml, String receiveid) {
    }

    /**
     * 解密密文（官方 §4.3 逆过程）：Base64 解码 → AES-256-CBC 解密 → 去 PKCS#7 补位 →
     * 跳过头部 16 随机字节 → 按 4 字节大端 msg_len 截取报文 → 余下为 receiveid。密文或
     * EncodingAESKey 不合法时抛出 {@link IllegalArgumentException}，由调用方按参数错误拒绝。
     */
    public Decrypted decrypt(String encodingAesKey, String msgEncrypt) {
        byte[] plain = aes(encodingAesKey, Cipher.DECRYPT_MODE, decodeBase64(msgEncrypt));
        byte[] unpadded = unpad(plain);
        if (unpadded.length < 16 + 4) {
            throw new IllegalArgumentException("解密结果缺少 random(16B) 与 msg_len(4B) 结构");
        }
        int msgLength = ((unpadded[16] & 0xFF) << 24) | ((unpadded[17] & 0xFF) << 16)
            | ((unpadded[18] & 0xFF) << 8) | (unpadded[19] & 0xFF);
        // msg_len 高位置 1 时 int 为负，与越界一并拒绝，避免按负长度截取报文
        if (msgLength < 0 || 16 + 4 + msgLength > unpadded.length) {
            throw new IllegalArgumentException("msg_len 非法（负值或超出解密结果长度）");
        }
        return new Decrypted(
            new String(unpadded, 20, msgLength, StandardCharsets.UTF_8),
            new String(unpadded, 20 + msgLength, unpadded.length - 20 - msgLength, StandardCharsets.UTF_8));
    }

    /**
     * 加密（官方 §4.3，解密的逆过程）：拼接 random(16B) + msg_len(4B 大端) + msg +
     * receiveid 后 AES 加密再 Base64。当前仅测试按黄金向量构造对拍报文使用。
     */
    public String encrypt(String encodingAesKey, byte[] random16, byte[] xml, String receiveid) {
        if (random16 == null || random16.length != 16) {
            throw new IllegalArgumentException("随机数须为 16 字节");
        }
        byte[] msgLength = {(byte) (xml.length >>> 24), (byte) (xml.length >>> 16),
            (byte) (xml.length >>> 8), (byte) xml.length};
        byte[] receiveidBytes = receiveid.getBytes(StandardCharsets.UTF_8);
        byte[] randMsg = new byte[16 + 4 + xml.length + receiveidBytes.length];
        System.arraycopy(random16, 0, randMsg, 0, 16);
        System.arraycopy(msgLength, 0, randMsg, 16, 4);
        System.arraycopy(xml, 0, randMsg, 20, xml.length);
        System.arraycopy(receiveidBytes, 0, randMsg, 20 + xml.length, receiveidBytes.length);
        return Base64.getEncoder().encodeToString(aes(encodingAesKey, Cipher.ENCRYPT_MODE, pad(randMsg)));
    }

    // AES-256-CBC：key=Base64Decode(EncodingAESKey+"=")，IV=key 前 16 字节，补位由调用方按企微规则处理
    private byte[] aes(String encodingAesKey, int mode, byte[] input) {
        byte[] key = aesKey(encodingAesKey);
        try {
            Cipher cipher = Cipher.getInstance("AES/CBC/NoPadding");
            cipher.init(mode, new SecretKeySpec(key, "AES"), new IvParameterSpec(key, 0, 16));
            return cipher.doFinal(input);
        } catch (GeneralSecurityException e) {
            // 密钥/补位外的失败只有输入形状不合法（如长度非块整数倍），统一按参数错误拒绝
            throw new IllegalArgumentException("AES 运算失败", e);
        }
    }

    // EncodingAESKey 官方固定 43 位（a-z A-Z 0-9），补一个 = 即 44 位标准 Base64，解出 32 字节
    private byte[] aesKey(String encodingAesKey) {
        if (encodingAesKey == null || encodingAesKey.length() != 43) {
            throw new IllegalArgumentException("EncodingAESKey 须为 43 位");
        }
        byte[] key = Base64.getDecoder().decode(encodingAesKey + "=");
        if (key.length != 32) {
            throw new IllegalArgumentException("EncodingAESKey 无法解码为 32 字节 AESKey");
        }
        return key;
    }

    private byte[] decodeBase64(String msgEncrypt) {
        if (msgEncrypt == null || msgEncrypt.isEmpty()) {
            throw new IllegalArgumentException("密文为空");
        }
        try {
            return Base64.getDecoder().decode(msgEncrypt);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("密文 Base64 解码失败", e);
        }
    }

    // 企微 PKCS#7 补位：以 32 字节块为单位，补位值 1..=32，整段同值
    private byte[] pad(byte[] data) {
        int padLength = PAD_BLOCK - (data.length % PAD_BLOCK);
        byte[] padded = Arrays.copyOf(data, data.length + padLength);
        Arrays.fill(padded, data.length, padded.length, (byte) padLength);
        return padded;
    }

    // 去补位：末字节为补位长度且整段同值，否则视为密文损坏
    private byte[] unpad(byte[] data) {
        if (data.length == 0) {
            throw new IllegalArgumentException("解密结果为空");
        }
        int padLength = data[data.length - 1] & 0xFF;
        if (padLength < 1 || padLength > PAD_BLOCK || padLength > data.length) {
            throw new IllegalArgumentException("PKCS#7 补位非法");
        }
        for (int index = data.length - padLength; index < data.length; index++) {
            if (data[index] != (byte) padLength) {
                throw new IllegalArgumentException("PKCS#7 补位非法");
            }
        }
        return Arrays.copyOf(data, data.length - padLength);
    }

    private String sha1Hex(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-1").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("当前运行环境缺少 SHA-1 实现", e);
        }
    }
}
