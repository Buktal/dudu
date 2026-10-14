package com.dudu.duduserver.channel.feishu;

import cn.hutool.crypto.Mode;
import cn.hutool.crypto.Padding;
import cn.hutool.crypto.digest.DigestUtil;
import cn.hutool.crypto.symmetric.AES;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import org.junit.jupiter.api.Test;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 飞书回调协议纯逻辑验收：官方数值例验签（明文 token 比对与 X-Lark-Signature
 * sha256 双轨）、官方 AES 解密回归向量、url_verification challenge 握手、
 * im.message.receive_v1 官方样本解析与全 message_type 统一消息体映射
 * （事实见 docs/research/channels/feishu.md，官方向量与 mock-pulse 基准一致）。
 */
class FeishuProtocolTest {

    private static final long CHANNEL_ID = 9101L;
    private static final String MESSAGE_ID = "om_5ce6d572455d361153b7cb51da133945";

    // ---- 官方向量（feishu.md §3.2/§4.2/§4.3/§5.4 逐字，mock-pulse tests/mod.rs 同源） ----

    // 官方 §4.3 加密策略样例：Encrypt Key = `test key`、密文 `P37w…` 解出 `hello world`
    private static final String GOLDEN_ENCRYPT_KEY = "test key";
    private static final String GOLDEN_ENCRYPT = "P37w+VZImNgPEO1RBhJ6RtKl7n6zymIbEG1pReEzghk=";
    private static final String GOLDEN_PLAINTEXT = "hello world";

    // 官方 §4.2 签名向量：sha256(timestamp + nonce + encrypt_key + 原始 body 字节)
    private static final String GOLDEN_SIGNATURE_TIMESTAMP = "1608725989";
    private static final String GOLDEN_SIGNATURE_NONCE = "5e3702a84e847582be8db7fb73283c02";
    private static final String GOLDEN_SIGNATURE_BODY =
        "{\"encrypt\":\"P37w+VZImNgPEO1RBhJ6RtKl7n6zymIbEG1pReEzghk=\"}";
    private static final String GOLDEN_SIGNATURE =
        "d6022e3ed080491cf61a26d64a132f8dcf090e73d2d0411c8a6f002e8e990941";

    // 事件 header token（§5.4 官方样本逐字；Verification Token 明文比对形态）
    private static final String GOLDEN_EVENT_TOKEN = "rvaYgkND1GOiu5MM0E1rncYC6PLtF7JV";

    @Test
    void verifyChecksOfficialSignatureVectorInEncryptedMode() {
        FeishuCredentials credentials = credentials(GOLDEN_ENCRYPT_KEY);

        assertThat(protocol.verify(credentials, GOLDEN_SIGNATURE_TIMESTAMP, GOLDEN_SIGNATURE_NONCE,
            GOLDEN_SIGNATURE, GOLDEN_SIGNATURE_BODY)).isTrue();

        // 签名任一位改动、nonce 不同或缺少签名头都按验签失败拒绝
        assertThat(protocol.verify(credentials, GOLDEN_SIGNATURE_TIMESTAMP, GOLDEN_SIGNATURE_NONCE,
            "0".repeat(64), GOLDEN_SIGNATURE_BODY)).isFalse();
        assertThat(protocol.verify(credentials, GOLDEN_SIGNATURE_TIMESTAMP, "other-nonce",
            GOLDEN_SIGNATURE, GOLDEN_SIGNATURE_BODY)).isFalse();
        assertThat(protocol.verify(credentials, GOLDEN_SIGNATURE_TIMESTAMP, GOLDEN_SIGNATURE_NONCE,
            null, GOLDEN_SIGNATURE_BODY)).isFalse();
    }

    @Test
    void verifyComparesDocumentedTokenInPlaintextMode() {
        FeishuCredentials credentials = credentials(null);

        // 事件 v2.0 明文：token 在 header.token；url_verification 明文三参：token 在顶层
        assertThat(protocol.verify(credentials, "1608725989", "nonce", null,
            GOLDEN_EVENT_PLAINTEXT)).isTrue();
        assertThat(protocol.verify(credentials, "1608725989", "nonce", null,
            "{\"challenge\":\"ajls384kdjxxxx\",\"token\":\"" + GOLDEN_EVENT_TOKEN + "\",\"type\":\"url_verification\"}"))
            .isTrue();

        // token 不符按验签失败；明文模式没有签名头可比对，signature 参数不参与
        assertThat(protocol.verify(credentials, "1608725989", "nonce", null,
            GOLDEN_EVENT_PLAINTEXT.replace(GOLDEN_EVENT_TOKEN, "wrong-token"))).isFalse();

        // 配置了 Encrypt Key 的账号不再走 token 明文比对，签名不符一律拒绝
        assertThat(protocol.verify(credentials(GOLDEN_ENCRYPT_KEY), "1608725989", "nonce", null,
            GOLDEN_EVENT_PLAINTEXT)).isFalse();
    }

    @Test
    void decryptsOfficialEnvelopeVectorAndPassesPlaintextThrough() {
        // 官方 §4.3 回归向量：密文 P37w…（key = test key）解出 hello world（独立真值）
        assertThat(protocol.plaintext(credentials(GOLDEN_ENCRYPT_KEY), GOLDEN_SIGNATURE_BODY))
            .isEqualTo(GOLDEN_PLAINTEXT);

        // 明文模式原样透传，不做解密
        assertThat(protocol.plaintext(credentials(null), GOLDEN_EVENT_PLAINTEXT)).isEqualTo(GOLDEN_EVENT_PLAINTEXT);
    }

    @Test
    void unreadableEncryptedEnvelopeIsRejected() {
        FeishuCredentials credentials = credentials(GOLDEN_ENCRYPT_KEY);

        // 非 Base64、不足一个 IV 段、密钥不符三类解密失败都按无法解读处理
        assertThatThrownBy(() -> protocol.plaintext(credentials, "{\"encrypt\":\"not-base64!!!\"}"))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> protocol.plaintext(credentials,
            "{\"encrypt\":\"" + Base64.getEncoder().encodeToString(new byte[8]) + "\"}"))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> protocol.plaintext(credentials(GOLDEN_ENCRYPT_KEY + "x"),
            "{\"encrypt\":\"" + GOLDEN_ENCRYPT + "\"}")).isInstanceOf(IllegalArgumentException.class);

        // 配置 Encrypt Key 后报文不是单字段信封同样无法解读
        assertThatThrownBy(() -> protocol.plaintext(credentials, GOLDEN_EVENT_PLAINTEXT))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void echoesChallengeFromHandshakeOnly() {
        // 官方 §3.2 明文三参握手：challenge 原样回显
        String handshake = "{\"challenge\":\"ajls384kdjxxxx\",\"token\":\"" + GOLDEN_EVENT_TOKEN
            + "\",\"type\":\"url_verification\"}";
        assertThat(protocol.challengeOf(handshake)).isEqualTo("ajls384kdjxxxx");

        // 加密握手：信封解出后同样按 challenge 回显（mock-pulse echo_challenge 同构）
        assertThat(protocol.challengeOf(protocol.plaintext(credentials(GOLDEN_ENCRYPT_KEY),
            envelope(GOLDEN_ENCRYPT_KEY, handshake)))).isEqualTo("ajls384kdjxxxx");

        // 事件推送与无法识别的报文不是握手，返回 null 交由调用方继续走事件解析
        assertThat(protocol.challengeOf(GOLDEN_EVENT_PLAINTEXT)).isNull();
        assertThat(protocol.challengeOf("not-json")).isNull();
    }

    @Test
    void parsesGoldenEventSampleIntoInboundMessage() {
        Optional<ChannelInboundMessage> parsed = protocol.parse(CHANNEL_ID, GOLDEN_EVENT_PLAINTEXT);

        assertThat(parsed).isPresent();
        ChannelInboundMessage inbound = parsed.get();
        assertThat(inbound.companyChannelId()).isEqualTo(CHANNEL_ID);
        // 发送方身份取 open_id（发送 API receive_id_type=open_id 对应回同型标识）
        assertThat(inbound.externalUserId()).isEqualTo("ou_84aad35d084aa403a838cf73ee18467");
        // 幂等键为 message_id（官方：不要依赖 event_id 去重）
        assertThat(inbound.externalMessageId()).isEqualTo("om_5ce6d572455d361153b7cb51da133945");
        assertThat(inbound.direction()).isEqualTo(MessageDirectionEnum.INCOMING);
        assertThat(inbound.name()).isNull();
        assertThat(inbound.avatarUrl()).isNull();
        assertThat(inbound.channelFields()).isEmpty();
        // content 是 JSON 序列化字符串，@ 占位符按原样保留（不猜提及者）
        assertThat(inbound.content()).isEqualTo(Map.of("type", "text", "text", "@_user_1 hello"));
    }

    @Test
    void mapsOfficialMediaAndLocationContentsToUnifiedBody() {
        // 官方 §5.12 结构逐字：image 的 image_key 经下载接口 type=image 读取
        Map<String, Object> image = parseContent("image",
            "{\"image_key\":\"img_v2_d71b0c58-4ac0-4a67-83aa-4f4a54d3409g\"}");
        assertThat(image.get("type")).isEqualTo("image");
        assertThat(media(image)).containsEntry("kind", "image")
            .containsEntry("id", MESSAGE_ID + ":img_v2_d71b0c58-4ac0-4a67-83aa-4f4a54d3409g:image");

        // file：file_key + file_name，经下载接口 type=file 读取
        Map<String, Object> file = parseContent("file",
            "{\"file_key\":\"file_v2_0dcdd7d9-fib0-4432-a519-41d25aca542j\",\"file_name\":\"test.txt\"}");
        assertThat(file.get("type")).isEqualTo("file");
        assertThat(media(file)).containsEntry("kind", "file")
            .containsEntry("id", MESSAGE_ID + ":file_v2_0dcdd7d9-fib0-4432-a519-41d25aca542j:file")
            .containsEntry("name", "test.txt");

        // audio → audio；media（视频）→ video，名称如实带上
        Map<String, Object> audio = parseContent("audio", "{\"file_key\":\"file_v2_x\",\"duration\":2000}");
        assertThat(audio.get("type")).isEqualTo("audio");
        assertThat(media(audio)).containsEntry("kind", "audio")
            .containsEntry("id", MESSAGE_ID + ":file_v2_x:file");

        Map<String, Object> video = parseContent("media",
            "{\"file_key\":\"file_v2_y\",\"image_key\":\"img_v2_z\",\"file_name\":\"测试视频.mp4\",\"duration\":2000}");
        assertThat(video.get("type")).isEqualTo("video");
        assertThat(media(video)).containsEntry("kind", "video")
            .containsEntry("id", MESSAGE_ID + ":file_v2_y:file")
            .containsEntry("name", "测试视频.mp4");

        // location：官方经纬度为字符串数字，转数值保存
        Map<String, Object> location = parseContent("location",
            "{\"name\":\"xx省xx市\",\"longitude\":\"116.397755\",\"latitude\":\"39.903179\"}");
        assertThat(location)
            .containsEntry("type", "location")
            .containsEntry("name", "xx省xx市")
            .containsEntry("longitude", 116.397755d)
            .containsEntry("latitude", 39.903179d);
    }

    @Test
    void unmappedOrBrokenContentsStayUnknownInsteadOfGuessing() {
        // sticker/folder 官方明确不可下载；post/interactive/share_* 结构复杂不猜测内容
        assertThat(parseContent("sticker", "{\"file_key\":\"file_v2_s\"}"))
            .isEqualTo(Map.of("type", "unknown", "originalType", "sticker"));
        assertThat(parseContent("post", "{\"title\":\"第一条消息\",\"content\":[[{\"tag\":\"text\"}]]}"))
            .isEqualTo(Map.of("type", "unknown", "originalType", "post"));
        assertThat(parseContent("interactive", "{\"title\":\"卡片标题\"}"))
            .isEqualTo(Map.of("type", "unknown", "originalType", "interactive"));
        assertThat(parseContent("share_chat", "{\"chat_id\":\"oc_4b0ae688d700e19fea687f785f60a3cc\"}"))
            .isEqualTo(Map.of("type", "unknown", "originalType", "share_chat"));
        assertThat(parseContent("hongbao", "{\"text\":\"[红包]\"}"))
            .isEqualTo(Map.of("type", "unknown", "originalType", "hongbao"));

        // 媒体缺 key、位置精度不是数字：没有可如实表达的引用/数值时归 unknown 不填假值
        assertThat(parseContent("image", "{}"))
            .isEqualTo(Map.of("type", "unknown", "originalType", "image"));
        assertThat(parseContent("file", "{\"file_name\":\"test.txt\"}"))
            .isEqualTo(Map.of("type", "unknown", "originalType", "file"));
        assertThat(parseContent("location", "{\"longitude\":\"abc\",\"latitude\":\"39.9\"}"))
            .isEqualTo(Map.of("type", "unknown", "originalType", "location"));
    }

    @Test
    void rejectsIdentitylessOrIdlessPayloadsAndAcknowledgesOtherEvents() {
        // 非 JSON 报文与缺 event 字段都按参数错误拒绝
        assertThatThrownBy(() -> protocol.parse(CHANNEL_ID, "not-json"))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> protocol.parse(CHANNEL_ID, "{\"schema\":\"2.0\"}"))
            .isInstanceOf(IllegalArgumentException.class);

        // 消息事件缺发送方 open_id 身份或幂等键 message_id 都拒绝（官方指定按 message_id 去重）
        assertThatThrownBy(() -> protocol.parse(CHANNEL_ID, event(null, "om_x")))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> protocol.parse(CHANNEL_ID, event("ou_x", null)))
            .isInstanceOf(IllegalArgumentException.class);

        // 已读、撤回等其余事件只应答不落库（官方 §5.5 reader 结构）
        assertThat(protocol.parse(CHANNEL_ID,
            "{\"event\":{\"reader\":{\"reader_id\":{\"open_id\":\"ou_x\"}},\"message_id_list\":[\"om_x\"]}}"))
            .isEmpty();
    }

    // ---- 夹具 ----

    private final FeishuProtocol protocol = new FeishuProtocol();

    private FeishuCredentials credentials(String encryptKey) {
        return new FeishuCredentials("cli_9f5343c580712544", "dskLLdkasdjlasdKK", GOLDEN_EVENT_TOKEN, encryptKey);
    }

    // 事实库 §5.4 im.message.receive_v1 官方样本（逐字，紧凑单行 = mock-pulse 直发的线上明文形态）
    private static final String GOLDEN_EVENT_PLAINTEXT = concatEventSample();

    // 构造最小消息事件（openId 或 messageId 为 null 时省略该字段）
    private String event(String openId, String messageId) {
        JSONObject message = JSONUtil.createObj()
            .set("message_type", "text")
            .set("content", "{\"text\":\"hi\"}");
        if (messageId != null) {
            message.set("message_id", messageId);
        }
        JSONObject senderId = JSONUtil.createObj();
        if (openId != null) {
            senderId.set("open_id", openId);
        }
        return JSONUtil.createObj()
            .set("event", JSONUtil.createObj()
                .set("sender", JSONUtil.createObj().set("sender_id", senderId))
                .set("message", message))
            .toString();
    }

    // 按官方事件结构构造指定 message_type 与 content 的样本，返回统一消息体
    @SuppressWarnings("unchecked")
    private Map<String, Object> parseContent(String msgType, String contentJson) {
        JSONObject payload = JSONUtil.createObj()
            .set("header", JSONUtil.createObj().set("event_type", "im.message.receive_v1"))
            .set("event", JSONUtil.createObj()
                .set("sender", JSONUtil.createObj()
                    .set("sender_id", JSONUtil.createObj().set("open_id", "ou_84aad35d084aa403a838cf73ee18467")))
                .set("message", JSONUtil.createObj()
                    .set("message_id", MESSAGE_ID)
                    .set("message_type", msgType)
                    .set("content", contentJson)));
        return protocol.parse(CHANNEL_ID, payload.toString()).orElseThrow().content();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> media(Map<String, Object> content) {
        return (Map<String, Object>) content.get("media");
    }

    // 测试侧按官方 §4.3 构造加密信封：key = sha256(encrypt_key)，随机 16B IV 置于密文头部
    private String envelope(String encryptKey, String plaintextJson) {
        byte[] iv = new byte[16];
        new SecureRandom().nextBytes(iv);
        AES aes = new AES(Mode.CBC, Padding.PKCS5Padding, DigestUtil.sha256(encryptKey), iv);
        byte[] encrypted = aes.encrypt(plaintextJson.getBytes(StandardCharsets.UTF_8));
        byte[] data = ByteBuffer.allocate(16 + encrypted.length).put(iv).put(encrypted).array();
        return "{\"encrypt\":\"" + Base64.getEncoder().encodeToString(data) + "\"}";
    }

    private static String concatEventSample() {
        return "{\"schema\":\"2.0\","
            + "\"header\":{\"event_id\":\"5e3702a84e847582be8db7fb73283c02\","
            + "\"event_type\":\"im.message.receive_v1\",\"create_time\":\"1608725989000\","
            + "\"token\":\"" + GOLDEN_EVENT_TOKEN + "\","
            + "\"app_id\":\"cli_9f5343c580712544\",\"tenant_key\":\"2ca1d211f64f6438\"},"
            + "\"event\":{\"sender\":{\"sender_id\":{\"union_id\":\"on_8ed6aa67826108097d9ee143816345\","
            + "\"user_id\":\"e33ggbyz\",\"open_id\":\"ou_84aad35d084aa403a838cf73ee18467\"},"
            + "\"sender_type\":\"user\",\"tenant_key\":\"736588c9260f175e\"},"
            + "\"message\":{\"message_id\":\"om_5ce6d572455d361153b7cb51da133945\","
            + "\"root_id\":\"om_5ce6d572455d361153b7cb5xxfsdfsdfdsf\","
            + "\"parent_id\":\"om_5ce6d572455d361153b7cb5xxfsdfsdfdsf\","
            + "\"create_time\":\"1609073151345\",\"update_time\":\"1687343654666\","
            + "\"chat_id\":\"oc_5ce6d572455d361153b7xx51da133945\",\"thread_id\":\"omt_d4be107c616\","
            + "\"chat_type\":\"group\",\"message_type\":\"text\",\"content\":\"{\\\"text\\\":\\\"@_user_1 hello\\\"}\","
            + "\"mentions\":[{\"key\":\"@_user_1\",\"id\":{\"union_id\":\"on_8ed6aa67826108097d9ee143816345\","
            + "\"user_id\":\"e33ggbyz\",\"open_id\":\"ou_84aad35d084aa403a838cf73ee18467\"},"
            + "\"mentioned_type\":\"user\",\"name\":\"Tom\",\"tenant_key\":\"736588c9260f175e\"}],"
            + "\"user_agent\":\"Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.53 Safari/537.36 Lark/6.7.5 LarkLocale/en_US ttnet SDK-Version/6.7.8\"}}}";
    }
}
