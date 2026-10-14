package com.dudu.duduserver.channel.qq;

import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONException;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.support.Digests;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * QQ 机器人回调协议原语（事实见 docs/research/channels/qq.md §3/§4/§5）：Ed25519 签名，
 * 密钥由 AppSecret 循环加倍截取 32 字节派生（官方 §5.2 Go 参照；JDK 只接受 PKCS#8 编码
 * 私钥，故按 RFC 8410 拼装固定前缀 + seed）；op13 首次验证握手回 plain_token 回显与
 * hex 签名；事件推送验签见 verify；信封 {op,t,d} 解析与消息事件入站解析见 envelope/parse，
 * 事件推送与关系链事件返回空表示只应答不落库。访客身份带场景前缀（QQ openid 仅在场景内
 * 有意义，且发送端点按场景二分：c2c→/v2/users、group→/v2/groups）。官方黄金向量
 * （§3.2/§4.2）为回归基准。
 */
@Component
public class QqProtocol {

    // RFC 8410 Ed25519 私钥 PKCS#8 前缀（版本 0 + AlgorithmIdentifier OID 1.3.101.112 + 八字节组标签）
    private static final byte[] ED25519_PKCS8_PREFIX = HexFormat.of()
        .parseHex("302e020100300506032b657004220420");
    private static final int SEED_SIZE = 32;
    private static final String SIGNATURE_ALGORITHM = "Ed25519";
    private static final String KEY_PLAIN_TOKEN = "plain_token";
    private static final String KEY_SIGNATURE = "signature";

    // 消息类事件（四件套入站范围，qq.md §2.1）
    private static final String EVENT_C2C = "C2C_MESSAGE_CREATE";
    private static final String EVENT_GROUP_AT = "GROUP_AT_MESSAGE_CREATE";
    private static final String EVENT_GROUP_ALL = "GROUP_MESSAGE_CREATE";
    private static final String EVENT_GUILD_AT = "AT_MESSAGE_CREATE";

    // 会话场景前缀：发送端点按场景二分（§5.8 单聊 / §5.9 群；频道发送要求 WS 在线，未接入）
    public static final String SCENE_C2C = "c2c";
    public static final String SCENE_GROUP = "group";
    public static final String SCENE_GUILD = "guild";
    private static final String[] SCENES = {SCENE_C2C, SCENE_GROUP, SCENE_GUILD};

    // 契约第 4 节统一消息体键名（与 wechat-mp/wecom 适配器同键）
    private static final String KEY_TYPE = "type";
    private static final String TYPE_TEXT = "text";
    private static final String KEY_ORIGINAL_TYPE = "originalType";
    private static final String TYPE_UNKNOWN = "unknown";
    private static final String KIND_IMAGE = "image";
    private static final String KIND_VIDEO = "video";
    private static final String KIND_AUDIO = "audio";
    private static final String KIND_FILE = "file";

    /**
     * op13 握手应答报文：plain_token 原样回显，signature 为 hex(Ed25519.Sign(priv,
     * event_ts + plain_token))（官方 §3.2/§5.2 逐字口径）。
     */
    public String handshakeResponse(String appSecret, String plainToken, String eventTs) {
        byte[] signature = sign(appSecret,
            eventTs.getBytes(StandardCharsets.UTF_8), plainToken.getBytes(StandardCharsets.UTF_8));
        return JSONUtil.createObj()
            .set(KEY_PLAIN_TOKEN, plainToken)
            .set(KEY_SIGNATURE, HexFormat.of().formatHex(signature))
            .toString();
    }

    /**
     * 事件推送验签（官方 §4.2）：签名体 = X-Signature-Timestamp 头字符串 + 原始 Body
     * 字节，Ed25519.Verify(publicKey, msg, sig)。JDK 无法由 seed 推导公钥（无
     * EdDSAPublicKeySpec），改用同一 seed 重签名后常量时间比对——同一密钥下与官方验证
     * 等价且更严（只接受本密钥产生的规范签名）。签名头缺失、非 hex、长度非 64 字节一律
     * 拒绝（官方预检口径）。
     */
    public boolean verify(String appSecret, String signatureHeader, String timestampHeader, String body) {
        if (isBlank(appSecret) || isBlank(signatureHeader) || isBlank(timestampHeader) || body == null) {
            return false;
        }
        byte[] received;
        try {
            received = HexFormat.of().parseHex(signatureHeader);
        } catch (IllegalArgumentException e) {
            return false;
        }
        byte[] expected = sign(appSecret,
            timestampHeader.getBytes(StandardCharsets.UTF_8), body.getBytes(StandardCharsets.UTF_8));
        return Digests.constantTimeEquals(expected, received);
    }

    /**
     * 解析通用信封 {op,t,d}（§5.1）；报文为空、非 JSON、op/d 类型不符、缺 op 或缺 d 时
     * 抛出 {@link IllegalArgumentException}，由调用方按参数错误拒绝。
     */
    public Envelope envelope(String body) {
        JSONObject root;
        try {
            root = JSONUtil.parseObj(body);
        } catch (JSONException e) {
            throw new IllegalArgumentException("回调报文不是合法 JSON", e);
        }
        // op/d 类型不符（字符串 op、字符串或数组 d 等）：按参数错误拒绝，不外泄 500
        Integer op;
        JSONObject d;
        try {
            op = root.getInt("op");
            d = root.getJSONObject("d");
        } catch (JSONException | ClassCastException e) {
            throw new IllegalArgumentException("回调报文 op/d 类型不符", e);
        }
        if (op == null) {
            throw new IllegalArgumentException("回调报文缺少 op");
        }
        if (d == null) {
            throw new IllegalArgumentException("回调报文缺少 d");
        }
        return new Envelope(op, root.getStr("t"), d);
    }

    /**
     * 解析 op0 Dispatch 的消息事件为入站消息：c2c/群/频道三类消息按场景前缀标记访客身份，
     * 关系链事件与未收录事件名返回空表示只应答不落库（向前兼容新事件，不拒绝推送）；
     * 消息缺少会话对象身份时抛出 {@link IllegalArgumentException}，由调用方按参数错误拒绝。
     */
    public Optional<ChannelInboundMessage> parse(Long companyChannelId, Envelope envelope) {
        return switch (envelope.t() == null ? "" : envelope.t()) {
            case EVENT_C2C -> Optional.of(message(companyChannelId, SCENE_C2C,
                firstText(envelope.d(), "author", "user_openid", "id"), envelope.d()));
            case EVENT_GROUP_AT, EVENT_GROUP_ALL ->
                Optional.of(message(companyChannelId, SCENE_GROUP, envelope.d().getStr("group_openid"),
                    envelope.d()));
            case EVENT_GUILD_AT -> Optional.of(message(companyChannelId, SCENE_GUILD,
                firstText(envelope.d(), "author", "id", "id"), envelope.d()));
            default -> Optional.empty();
        };
    }

    // 消息事件统一装配：访客身份 = 场景前缀 + 会话对象，缺会话对象即无法入站
    private ChannelInboundMessage message(Long companyChannelId, String scene, String conversationId,
                                          JSONObject d) {
        if (isBlank(conversationId)) {
            throw new IllegalArgumentException("渠道报文缺少会话对象身份");
        }
        JSONObject author = d.getJSONObject("author");
        return new ChannelInboundMessage(companyChannelId, scene + ":" + conversationId,
            author == null ? null : text(author.getStr("username")),
            author == null ? null : text(author.getStr("avatar")),
            List.of(), text(d.getStr("id")), MessageDirectionEnum.INCOMING, content(d));
    }

    // 契约第 4 节统一消息体：附件优先（url 即可读引用），message_type=0 为文本；频道消息
    // 无 message_type 按正文判断；其余类型如实落 unknown 不猜正文
    private Map<String, Object> content(JSONObject d) {
        Map<String, Object> media = firstAttachment(d);
        if (media != null) {
            return Map.of("type", media.get("kind"), "media", media);
        }
        Integer messageType = d.getInt("message_type");
        if (messageType == null) {
            String text = text(d.getStr("content"));
            if (text != null) {
                return Map.of(KEY_TYPE, TYPE_TEXT, "text", text);
            }
            return Map.of(KEY_TYPE, TYPE_UNKNOWN, KEY_ORIGINAL_TYPE, TYPE_UNKNOWN);
        }
        if (messageType == 0) {
            return Map.of(KEY_TYPE, TYPE_TEXT, "text", d.getStr("content", ""));
        }
        return Map.of(KEY_TYPE, TYPE_UNKNOWN, KEY_ORIGINAL_TYPE, String.valueOf(messageType));
    }

    // 附件的 url 是渠道唯一媒体引用（无独立 MediaId，qq.md §5.12），缺 url 的附件不冒充可读媒体
    private Map<String, Object> firstAttachment(JSONObject d) {
        Object raw = d.get("attachments");
        if (!(raw instanceof JSONArray array)) {
            return null;
        }
        for (Object item : array) {
            if (!(item instanceof JSONObject attachment)) {
                continue;
            }
            String url = text(attachment.getStr("url"));
            if (url == null) {
                continue;
            }
            String kind = kindOf(attachment.getStr("content_type"));
            Map<String, Object> media = new LinkedHashMap<>();
            media.put("kind", kind);
            media.put("id", url);
            media.put("url", url);
            return media;
        }
        return null;
    }

    // content_type 前缀定媒体大类，其余按文件处理
    private String kindOf(String contentType) {
        if (contentType == null) {
            return KIND_FILE;
        }
        if (contentType.startsWith(KIND_IMAGE)) {
            return KIND_IMAGE;
        }
        if (contentType.startsWith(KIND_VIDEO)) {
            return KIND_VIDEO;
        }
        if (contentType.startsWith(KIND_AUDIO)) {
            return KIND_AUDIO;
        }
        return KIND_FILE;
    }

    // 嵌套取 author 下首个非空字段；缺 author 时逐级回退由入参给定
    private String firstText(JSONObject d, String nested, String primary, String fallback) {
        JSONObject parent = d.getJSONObject(nested);
        String value = parent == null ? null : text(parent.getStr(primary));
        return value != null ? value : (parent == null ? null : text(parent.getStr(fallback)));
    }

    private String text(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    // 用 seed 派生私钥对消息片段依次签名；JDK 缺少 Ed25519 实现属运行环境错误
    byte[] sign(String appSecret, byte[]... messageParts) {
        try {
            Signature signature = Signature.getInstance(SIGNATURE_ALGORITHM);
            signature.initSign(privateKey(seed(appSecret)));
            for (byte[] part : messageParts) {
                signature.update(part);
            }
            return signature.sign();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("当前运行环境缺少 Ed25519 实现", e);
        }
    }

    // 官方 Go 参照（§5.2）：seed 从 secret 循环加倍后截取 32 字节；空 secret 是配置错误
    private byte[] seed(String appSecret) {
        byte[] secret = appSecret.getBytes(StandardCharsets.UTF_8);
        if (secret.length == 0) {
            throw new IllegalArgumentException("AppSecret 为空，无法派生签名密钥");
        }
        byte[] seed = new byte[SEED_SIZE];
        for (int index = 0; index < SEED_SIZE; index++) {
            seed[index] = secret[index % secret.length];
        }
        return seed;
    }

    // JDK 只接受 PKCS#8 编码私钥：固定 RFC 8410 前缀 + 32 字节 seed
    private PrivateKey privateKey(byte[] seed) throws GeneralSecurityException {
        byte[] pkcs8 = new byte[ED25519_PKCS8_PREFIX.length + seed.length];
        System.arraycopy(ED25519_PKCS8_PREFIX, 0, pkcs8, 0, ED25519_PKCS8_PREFIX.length);
        System.arraycopy(seed, 0, pkcs8, ED25519_PKCS8_PREFIX.length, seed.length);
        return KeyFactory.getInstance(SIGNATURE_ALGORITHM).generatePrivate(new PKCS8EncodedKeySpec(pkcs8));
    }

    /**
     * 事件信封：op 路由（0 Dispatch / 13 握手验证）、t 事件名（op0 时有值）、d 事件体。
     */
    public record Envelope(int op, String t, JSONObject d) {
    }

    /**
     * 会话场景：场景名（c2c/group/guild）+ 场景内会话对象 openid，发送端点据此二分。
     */
    public record Conversation(String scene, String id) {
    }

    // 入站访客身份解码：无已知场景前缀返回 null，由发送方按无法路由如实失败
    public static Conversation conversation(String externalUserId) {
        if (externalUserId == null) {
            return null;
        }
        for (String scene : SCENES) {
            String prefix = scene + ":";
            if (externalUserId.startsWith(prefix)) {
                return new Conversation(scene, externalUserId.substring(prefix.length()));
            }
        }
        return null;
    }
}
