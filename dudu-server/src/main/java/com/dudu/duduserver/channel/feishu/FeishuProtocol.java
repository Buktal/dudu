package com.dudu.duduserver.channel.feishu;

import cn.hutool.core.codec.Base64;
import cn.hutool.crypto.Mode;
import cn.hutool.crypto.Padding;
import cn.hutool.crypto.digest.DigestUtil;
import cn.hutool.crypto.symmetric.AES;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.support.Coordinates;
import com.dudu.duduserver.channel.support.Digests;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.channel.support.MessageBodies;
import com.dudu.duduserver.channel.support.Texts;
import org.springframework.stereotype.Component;

import static com.dudu.duduserver.channel.support.JsonBodies.objectField;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 飞书回调协议（事实见 docs/research/channels/feishu.md）：验签双轨——配置 Encrypt Key
 * 后必须验 X-Lark-Signature = hex(sha256(timestamp + nonce + encrypt_key + 原始 body 字节))，
 * 明文模式（无 Encrypt Key）按官方 §4.1 只比对报文 token（握手三参在顶层、事件 v2.0 在
 * header.token）；解析与统一消息体映射由后续职责方法承接。
 */
@Component
public class FeishuProtocol {

    // 明文事件 v2.0 信封的 token 位置；url_verification 明文三参的 token 在顶层
    private static final String KEY_TOKEN = "token";
    private static final String KEY_HEADER = "header";

    // 嵌套字段取值报错时的语境前缀（共用取值口径见 JsonBodies）
    private static final String FIELD_CONTEXT = "飞书事件报文";

    // 官方 §4.3 加密信封：body 仅 {"encrypt":"<base64>"} 单字段
    private static final String KEY_ENCRYPT = "encrypt";

    // url_verification 明文三参的另一参名（官方 §3.2）
    private static final String KEY_TYPE = "type";
    private static final String KEY_CHALLENGE = "challenge";
    private static final String TYPE_URL_VERIFICATION = "url_verification";

    // 事件 v2.0 信封与消息事件的字段名（官方 §5.4）
    private static final String KEY_EVENT = "event";
    private static final String KEY_MESSAGE = "message";
    private static final String KEY_SENDER = "sender";
    private static final String KEY_SENDER_ID = "sender_id";
    private static final String KEY_OPEN_ID = "open_id";
    private static final String KEY_MESSAGE_ID = "message_id";
    private static final String KEY_MESSAGE_TYPE = "message_type";
    private static final String KEY_CONTENT = "content";

    // 飞书消息类型（官方 §5.12 全表；未列出的类型一律落 unknown）
    private static final String MSG_TYPE_TEXT = "text";
    private static final String MSG_TYPE_IMAGE = "image";
    private static final String MSG_TYPE_AUDIO = "audio";
    private static final String MSG_TYPE_MEDIA = "media";
    private static final String MSG_TYPE_FILE = "file";
    private static final String MSG_TYPE_LOCATION = "location";

    // 媒体 content 的 key 字段名与下载接口 type 查询参数取值（官方 §5.12、§5.13）
    private static final String KEY_IMAGE_KEY = "image_key";
    private static final String KEY_FILE_KEY = "file_key";
    private static final String KEY_FILE_NAME = "file_name";
    private static final String RESOURCE_TYPE_IMAGE = "image";
    private static final String RESOURCE_TYPE_FILE = "file";

    // 统一消息体的媒体 kind（契约第 4 节：飞书 media 类型即视频）
    private static final String KIND_IMAGE = "image";
    private static final String KIND_AUDIO = "audio";
    private static final String KIND_VIDEO = "video";
    private static final String KIND_FILE = "file";

    /**
     * 解出推送明文：明文模式原样返回；配置 Encrypt Key 时按官方信封解密
     * （Base64 后前 16 字节为 IV，余下为 AES-256-CBC 密文）。无法解读时抛出
     * {@link IllegalArgumentException}，由调用方按验签拒绝处理。
     */
    public String plaintext(FeishuCredentials credentials, String body) {
        if (credentials.encryptKey() == null) {
            return body;
        }
        try {
            String encrypt = JSONUtil.parseObj(body).getStr(KEY_ENCRYPT, null);
            if (encrypt == null) {
                throw new IllegalArgumentException("飞书加密报文缺少 encrypt 字段");
            }
            return decrypt(credentials.encryptKey(), encrypt);
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("飞书加密报文无法解密", e);
        }
    }

    /**
     * 解析推送明文：im.message.receive_v1 消息事件转为统一入站消息（幂等键
     * message_id，发送方身份取 open_id）；已读、撤回等其余事件返回空表示只应答
     * 不落库；报文无法解析或缺少身份/幂等键时抛出 {@link IllegalArgumentException}，
     * 由调用方按参数错误拒绝。
     */
    public Optional<ChannelInboundMessage> parse(Long companyChannelId, String plaintext) {
        JSONObject event;
        try {
            event = JSONUtil.parseObj(plaintext).getJSONObject(KEY_EVENT);
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("飞书事件报文无法解析", e);
        }
        if (event == null) {
            throw new IllegalArgumentException("飞书事件缺少 event 字段");
        }
        JSONObject message = objectField(event, KEY_MESSAGE, FIELD_CONTEXT);
        if (message == null) {
            // 已读、撤回等其余事件没有可落库的访客消息
            return Optional.empty();
        }
        JSONObject senderId = senderId(event);
        String externalUserId = senderId == null ? null : senderId.getStr(KEY_OPEN_ID, null);
        if (externalUserId == null || externalUserId.isEmpty()) {
            throw new IllegalArgumentException("飞书事件缺少发送方身份");
        }
        String messageId = message.getStr(KEY_MESSAGE_ID, null);
        if (messageId == null || messageId.isEmpty()) {
            throw new IllegalArgumentException("飞书事件缺少幂等键 message_id");
        }
        String msgType = message.getStr(KEY_MESSAGE_TYPE, "");
        return Optional.of(new ChannelInboundMessage(companyChannelId, externalUserId, null, null, List.of(),
            messageId, MessageDirectionEnum.INCOMING, content(msgType, messageId, contentOf(message))));
    }

    // content 是 JSON 序列化字符串（官方 §5.4）；解析失败按空对象处理，由映射如实落 unknown
    private JSONObject contentOf(JSONObject message) {
        try {
            return JSONUtil.parseObj(message.getStr(KEY_CONTENT, "{}"));
        } catch (RuntimeException e) {
            return new JSONObject();
        }
    }

    private JSONObject senderId(JSONObject event) {
        JSONObject sender = objectField(event, KEY_SENDER, FIELD_CONTEXT);
        return sender == null ? null : objectField(sender, KEY_SENDER_ID, FIELD_CONTEXT);
    }

    // 按 message_type 映射统一消息体；渠道不提供的可选信息省略，无法映射的按 unknown 如实保存
    private Map<String, Object> content(String msgType, String messageId, JSONObject content) {
        try {
            return switch (msgType) {
                case MSG_TYPE_TEXT -> text(content);
                case MSG_TYPE_IMAGE -> media(msgType, KIND_IMAGE, messageId, KEY_IMAGE_KEY,
                    RESOURCE_TYPE_IMAGE, content);
                case MSG_TYPE_AUDIO -> media(msgType, KIND_AUDIO, messageId, KEY_FILE_KEY,
                    RESOURCE_TYPE_FILE, content);
                case MSG_TYPE_MEDIA -> media(msgType, KIND_VIDEO, messageId, KEY_FILE_KEY,
                    RESOURCE_TYPE_FILE, content);
                case MSG_TYPE_FILE -> media(msgType, KIND_FILE, messageId, KEY_FILE_KEY,
                    RESOURCE_TYPE_FILE, content);
                case MSG_TYPE_LOCATION -> location(msgType, content);
                default -> MessageBodies.unknown(msgType);
            };
        } catch (RuntimeException e) {
            // 字段值不符合类型约定时如实落 unknown，不猜测内容
            return MessageBodies.unknown(msgType);
        }
    }

    private Map<String, Object> text(JSONObject content) {
        return Map.of("type", "text", "text", content.getStr("text", ""));
    }

    // 媒体标识编码为「message_id:file_key:下载接口 type」（§5.13 下载需双标识 + type 查询参数）；
    // 缺 key 时没有可如实表达的引用，按 unknown 如实保存不填假值
    private Map<String, Object> media(String msgType, String kind, String messageId, String keyField,
                                      String resourceType, JSONObject content) {
        String mediaKey = Texts.blankToNull(content.getStr(keyField, null));
        if (mediaKey == null) {
            return MessageBodies.unknown(msgType);
        }
        return MessageBodies.media(kind, messageId + ":" + mediaKey + ":" + resourceType, null,
            content.getStr(KEY_FILE_NAME, null));
    }

    // 官方 location 的经纬度为字符串数字，转数值保存；地点名的统一消息体键为 label
    // （契约 types.ts 的 location 分支），官方字段名 name 映射进 label；精度非法由 content() 兜底落 unknown
    private Map<String, Object> location(String msgType, JSONObject content) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("type", "location");
        String name = Texts.blankToNull(content.getStr("name", null));
        if (name != null) {
            body.put("label", name);
        }
        body.put("longitude", Coordinates.parse(content.getStr("longitude")));
        body.put("latitude", Coordinates.parse(content.getStr("latitude")));
        return body;
    }


    /**
     * url_verification 握手识别：明文三参（官方 §3.2）中 type=url_verification 时返回
     * challenge 供原样回显；事件推送与无法识别的报文返回 null，由调用方继续走事件解析。
     */
    public String challengeOf(String plaintext) {
        try {
            JSONObject json = JSONUtil.parseObj(plaintext);
            if (!TYPE_URL_VERIFICATION.equals(json.getStr(KEY_TYPE, null))) {
                return null;
            }
            return json.getStr(KEY_CHALLENGE, null);
        } catch (RuntimeException e) {
            return null;
        }
    }

    // 官方 §4.3：key = sha256(encrypt_key)（32 字节），IV 取 Base64 解码后的前 16 字节
    private String decrypt(String encryptKey, String encrypt) {
        byte[] decoded = Base64.decode(encrypt);
        if (decoded.length <= 16) {
            throw new IllegalArgumentException("飞书加密报文缺少 IV 段");
        }
        AES aes = new AES(Mode.CBC, Padding.PKCS5Padding, DigestUtil.sha256(encryptKey),
            Arrays.copyOfRange(decoded, 0, 16));
        byte[] plain = aes.decrypt(Arrays.copyOfRange(decoded, 16, decoded.length));
        return new String(plain, StandardCharsets.UTF_8);
    }

    /**
     * 验签：配置 Encrypt Key 的账号只认 sha256 签名头（原始字节直接摘要，不反序列化重算）；
     * 明文账号只比对报文内 token，签名参数不参与。
     */
    public boolean verify(FeishuCredentials credentials, String timestamp, String nonce, String signature,
                          String body) {
        if (credentials == null) {
            return false;
        }
        if (credentials.encryptKey() != null) {
            if (Texts.isBlank(signature) || Texts.isBlank(timestamp) || Texts.isBlank(nonce)) {
                return false;
            }
            return Digests.constantTimeEquals(signature(credentials.encryptKey(), timestamp, nonce, body), signature);
        }
        String token = tokenOf(body);
        return Digests.constantTimeEquals(credentials.verificationToken(), token);
    }

    // 报文 token：事件在 header.token，url_verification 明文三参在顶层 token
    private String tokenOf(String body) {
        try {
            JSONObject json = JSONUtil.parseObj(body);
            String token = json.getStr(KEY_TOKEN, null);
            if (token != null) {
                return token;
            }
            JSONObject header = json.getJSONObject(KEY_HEADER);
            return header == null ? null : header.getStr(KEY_TOKEN, null);
        } catch (RuntimeException e) {
            return null;
        }
    }

    // 官方 §4.2 签名算法：sha256(timestamp + nonce + encrypt_key + 原始 body 字节) 小写 hex
    private String signature(String encryptKey, String timestamp, String nonce, String body) {
        byte[] prefix = (timestamp + nonce + encryptKey).getBytes(StandardCharsets.UTF_8);
        byte[] rawBody = (body == null ? "" : body).getBytes(StandardCharsets.UTF_8);
        byte[] input = new byte[prefix.length + rawBody.length];
        System.arraycopy(prefix, 0, input, 0, prefix.length);
        System.arraycopy(rawBody, 0, input, prefix.length, rawBody.length);
        return Digests.sha256Hex(input);
    }

}
