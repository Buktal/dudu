package com.dudu.duduserver.channel.whatsapp;

import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * WhatsApp 回调协议纯逻辑验收（协议事实见 docs/research/channels/whatsapp.md）：
 * 验签锚定官方 §5.1/§5.2 信封明文 + Node crypto 交叉复算签名（mock-pulse whatsapp
 * golden 同源）与 HMAC-SHA256 通行示例向量；解析锚定官方 §5.1/§5.2/§5.4 与 §2.3 各
 * type 子页逐字载荷。验签必须对原始字节成立——同数据重序列化报文必须验不过。
 */
class WhatsappProtocolTest {

    private static final long CHANNEL_ID = 11201L;

    // 官方 §5.1 入站文本样例（紧凑键序同官方文档；mock-pulse whatsapp golden 同源）
    private static final String GOLDEN_INBOUND_PLAINTEXT = "{\"object\":\"whatsapp_business_account\","
        + "\"entry\":[{\"id\":\"102290129340398\",\"changes\":[{\"value\":{\"messaging_product\":\"whatsapp\","
        + "\"metadata\":{\"display_phone_number\":\"15550783881\",\"phone_number_id\":\"106540352242922\"},"
        + "\"contacts\":[{\"profile\":{\"name\":\"Sheena Nelson\"},\"wa_id\":\"16505551234\"}],"
        + "\"messages\":[{\"from\":\"16505551234\",\"id\":\"wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTRBNjU5OUFFRTAzODEwMTQ0RgA=\","
        + "\"timestamp\":\"1749416383\",\"type\":\"text\",\"text\":{\"body\":\"Does it come in another color?\"}}]},"
        + "\"field\":\"messages\"}]}]}";
    private static final String GOLDEN_INBOUND_WAMID =
        "wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTRBNjU5OUFFRTAzODEwMTQ0RgA=";

    // 官方 §5.2 delivered 状态样例（statuses 结构，无 messages）
    private static final String GOLDEN_DELIVERED_PLAINTEXT = "{\"object\":\"whatsapp_business_account\","
        + "\"entry\":[{\"id\":\"102290129340398\",\"changes\":[{\"value\":{\"messaging_product\":\"whatsapp\","
        + "\"metadata\":{\"display_phone_number\":\"15550783881\",\"phone_number_id\":\"106540352242922\"},"
        + "\"statuses\":[{\"id\":\"wamid.HBgLMTY1MDM4Nzk0MzkVAgARGBI3MTE5MjVBOTE3MDk5QUVFM0YA\","
        + "\"status\":\"delivered\",\"timestamp\":\"1750263773\",\"recipient_id\":\"16505551234\","
        + "\"conversation\":{\"id\":\"6ceb9d929c9bdc4f90e967a32f8639b4\",\"origin\":{\"type\":\"service\"}},"
        + "\"pricing\":{\"billable\":true,\"pricing_model\":\"CBP\",\"category\":\"service\"}}]},"
        + "\"field\":\"messages\"}]}]}";

    // Node crypto 交叉复算签名（key=whatsapp_app_secret，mock-pulse whatsapp golden 同源）
    private static final String GOLDEN_APP_SECRET = "whatsapp_app_secret";
    private static final String NODE_INBOUND_SIGNATURE =
        "sha256=d7cb4e2edfe5a785613849eeccb385976ef6e07b1032943a1a5fd785b13c28c3";
    private static final String NODE_DELIVERED_SIGNATURE =
        "sha256=67e0bee9f9d8d0d9d0f39be405c8bd29f16b38800222be27150fe5e6b094833a";

    // HMAC-SHA256 通行示例向量（key="key"、data="The quick brown fox jumps over the lazy dog"）
    private static final String FOX_TEXT = "The quick brown fox jumps over the lazy dog";
    private static final String FOX_SIGNATURE =
        "sha256=f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8";

    private final WhatsappProtocol protocol = new WhatsappProtocol();

    // ---- 验签（§4.1）----

    @Test
    void verifyMatchesNodeCrossComputedSignaturesOverOfficialPayloads() {
        assertThat(protocol.verify(GOLDEN_APP_SECRET, NODE_INBOUND_SIGNATURE, GOLDEN_INBOUND_PLAINTEXT)).isTrue();
        assertThat(protocol.verify(GOLDEN_APP_SECRET, NODE_DELIVERED_SIGNATURE, GOLDEN_DELIVERED_PLAINTEXT)).isTrue();
        // HMAC-SHA256 通行示例向量
        assertThat(protocol.verify("key", FOX_SIGNATURE, FOX_TEXT)).isTrue();
    }

    @Test
    void verifyRejectsForgedOrMalformedSignatureMaterial() {
        // 篡改 body 任一字节（含尾部空白）签名即变
        assertThat(protocol.verify(GOLDEN_APP_SECRET, NODE_INBOUND_SIGNATURE, GOLDEN_INBOUND_PLAINTEXT + " "))
            .isFalse();
        assertThat(protocol.verify(GOLDEN_APP_SECRET, NODE_INBOUND_SIGNATURE, GOLDEN_DELIVERED_PLAINTEXT)).isFalse();
        // 换密钥即验不过
        assertThat(protocol.verify("whatsapp_app_secreT", NODE_INBOUND_SIGNATURE, GOLDEN_INBOUND_PLAINTEXT))
            .isFalse();
        // 官方头形态固定 sha256= 前缀：缺前缀、错前缀、非 hex、长度不足一律拒绝
        String digest = NODE_INBOUND_SIGNATURE.substring("sha256=".length());
        assertThat(protocol.verify(GOLDEN_APP_SECRET, digest, GOLDEN_INBOUND_PLAINTEXT)).isFalse();
        assertThat(protocol.verify(GOLDEN_APP_SECRET, "md5=" + digest, GOLDEN_INBOUND_PLAINTEXT)).isFalse();
        assertThat(protocol.verify(GOLDEN_APP_SECRET, "sha256=not-hex", GOLDEN_INBOUND_PLAINTEXT)).isFalse();
        assertThat(protocol.verify(GOLDEN_APP_SECRET, "sha256=ab" + "0".repeat(62), GOLDEN_INBOUND_PLAINTEXT))
            .isFalse();
        // 材料缺失不抛异常，按拒绝处理
        assertThat(protocol.verify(null, NODE_INBOUND_SIGNATURE, GOLDEN_INBOUND_PLAINTEXT)).isFalse();
        assertThat(protocol.verify(GOLDEN_APP_SECRET, null, GOLDEN_INBOUND_PLAINTEXT)).isFalse();
        assertThat(protocol.verify(GOLDEN_APP_SECRET, NODE_INBOUND_SIGNATURE, null)).isFalse();
    }

    @Test
    void verifyOperatesOnRawBytesSoReserializedPayloadFails() {
        // 原始字节口径（§4.1 实现约束）：同数据重序列化（加空白/换键序）后字节序列已变，
        // 对重排字节验原始签名必须失败——先 parse 再重序列化会改变 digest
        String reserialized = "{\"object\": \"whatsapp_business_account\", \"entry\": []}";
        assertThat(protocol.verify(GOLDEN_APP_SECRET, NODE_INBOUND_SIGNATURE, reserialized)).isFalse();
        assertThat(protocol.verify(GOLDEN_APP_SECRET, NODE_INBOUND_SIGNATURE, GOLDEN_INBOUND_PLAINTEXT + "\n"))
            .isFalse();
    }

    // ---- 入站解析（§2.1/§2.3/§5）----

    @Test
    void parseMapsOfficialTextSampleToInboundMessage() {
        Optional<ChannelInboundMessage> inbound = protocol.parse(CHANNEL_ID, GOLDEN_INBOUND_PLAINTEXT);
        assertThat(inbound).isPresent();
        ChannelInboundMessage message = inbound.get();
        assertThat(message.companyChannelId()).isEqualTo(CHANNEL_ID);
        assertThat(message.externalUserId()).isEqualTo("16505551234");
        assertThat(message.name()).isEqualTo("Sheena Nelson");
        assertThat(message.avatarUrl()).isNull();
        assertThat(message.channelFields()).isEmpty();
        assertThat(message.externalMessageId()).isEqualTo(GOLDEN_INBOUND_WAMID);
        assertThat(message.direction()).isEqualTo(MessageDirectionEnum.INCOMING);
        assertThat(message.content()).isEqualTo(Map.of("type", "text", "text", "Does it come in another color?"));
    }

    @Test
    void parseAnswersOnlyForStatusesAndManagementFieldChanges() {
        // outbound 状态（§5.2）：只应答不落库
        assertThat(protocol.parse(CHANNEL_ID, GOLDEN_DELIVERED_PLAINTEXT)).isEmpty();
        // 管理面字段变更（§5.4 message_template_status_update）：只应答不落库
        assertThat(protocol.parse(CHANNEL_ID, """
            {"entry":[{"id":"102290129340398","time":1751247548,"changes":[{"value":{"event":"APPROVED",
            "message_template_id":1689556908129832,"message_template_name":"order_confirmation",
            "message_template_language":"en-US","reason":"NONE","message_template_category":"UTILITY"},
            "field":"message_template_status_update"}]}],
            "object":"whatsapp_business_account"}""")).isEmpty();
        // value 既无 messages 也无 statuses（如电话号码质量变更 §5.5）：只应答不落库
        assertThat(protocol.parse(CHANNEL_ID, """
            {"entry":[{"id":"102290129340398","time":1748454394,"changes":[{"value":{"display_phone_number":
            "15550783881","event":"THROUGHPUT_UPGRADE","current_limit":"TIER_UNLIMITED"},
            "field":"phone_number_quality_update"}]}],"object":"whatsapp_business_account"}""")).isEmpty();
    }

    @Test
    void parseMapsMediaTypesToContractMediaReference() {
        // image（§2.3 官方样例）：载荷灰度带的 url 需 Bearer 下载，不是公开直链，不进媒体引用
        assertThat(content("" + "{\"object\":\"whatsapp_business_account\",\"entry\":[{\"id\":\"1\","
            + "\"changes\":[{\"field\":\"messages\",\"value\":{\"messaging_product\":\"whatsapp\","
            + "\"metadata\":{},\"contacts\":[],\"messages\":[{\"from\":\"16505551234\",\"id\":\"wamid.IMG1\","
            + "\"timestamp\":\"1744344496\",\"type\":\"image\",\"image\":{\"caption\":\"Taj Mahal\","
            + "\"mime_type\":\"image/jpeg\",\"sha256\":\"SfI=\",\"id\":\"1003383421387256\","
            + "\"url\":\"https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=133\"}}]}}]}]}"))
            .isEqualTo(Map.of("type", "image", "media", Map.of("kind", "image", "id", "1003383421387256")));

        // audio（voice 录音标识不进契约）
        assertThat(content("""
            {"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"field":"messages",
            "value":{"messages":[{"from":"16505551234","id":"wamid.AUD1","timestamp":"1744344496",
            "type":"audio","audio":{"mime_type":"audio/ogg; codecs=opus","sha256":"x=","voice":true,
            "id":"1908647269898587"}}]}}]}],"object":"whatsapp_business_account"}"""))
            .isEqualTo(Map.of("type", "audio", "media", Map.of("kind", "audio", "id", "1908647269898587")));

        // document（filename 进 media.name）
        assertThat(content("""
            {"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"field":"messages",
            "value":{"messages":[{"from":"16505551234","id":"wamid.DOC1","timestamp":"1744344496",
            "type":"document","document":{"caption":"my receipt","filename":"receipt.pdf",
            "mime_type":"application/pdf","sha256":"x=","id":"622684793477189"}}]}}]}],
            "object":"whatsapp_business_account"}"""))
            .isEqualTo(Map.of("type", "file", "media",
                Map.of("kind", "file", "id", "622684793477189", "name", "receipt.pdf")));

        // sticker（webp 贴纸按可读图片处理）
        assertThat(content("""
            {"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"field":"messages",
            "value":{"messages":[{"from":"16505551234","id":"wamid.STK1","timestamp":"1744344496",
            "type":"sticker","sticker":{"mime_type":"image/webp","sha256":"x=","animated":true,
            "id":"1908647269800001"}}]}}]}],"object":"whatsapp_business_account"}"""))
            .isEqualTo(Map.of("type", "image", "media", Map.of("kind", "image", "id", "1908647269800001")));

        // 媒体对象缺 id：没有可读引用，按 unknown 如实保存不填假值
        assertThat(content("""
            {"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"field":"messages",
            "value":{"messages":[{"from":"16505551234","id":"wamid.IMG2","timestamp":"1744344496",
            "type":"image","image":{"mime_type":"image/jpeg"}}]}}]}],"object":"whatsapp_business_account"}"""))
            .isEqualTo(Map.of("type", "unknown", "originalType", "image"));
    }

    @Test
    void parseMapsLocationToContractLocationBody() {
        // §2.3 官方 location 样例：名称优先作 label，坐标为数值
        assertThat(content("""
            {"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"field":"messages",
            "value":{"messages":[{"from":"16505551234","id":"wamid.LOC1","timestamp":"1744344496",
            "type":"location","location":{"address":"101 Forest Ave, Palo Alto, CA 94301",
            "latitude":37.44221496582,"longitude":-122.16165924072,"name":"Philz Coffee",
            "url":"https://philzcoffee.com/"}}]}}]}],"object":"whatsapp_business_account"}"""))
            .isEqualTo(Map.of("type", "location", "label", "Philz Coffee",
                "latitude", 37.44221496582, "longitude", -122.16165924072));

        // 无名称回退地址；两者皆无则省略 label
        assertThat(content("""
            {"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"field":"messages",
            "value":{"messages":[{"from":"16505551234","id":"wamid.LOC2","timestamp":"1744344496",
            "type":"location","location":{"latitude":1.5,"longitude":2.5}}]}}]}],
            "object":"whatsapp_business_account"}"""))
            .isEqualTo(Map.of("type", "location", "latitude", 1.5, "longitude", 2.5));

        // JSON 数值 token 溢出为非有限 Double（getDouble 不抛异常）时按 unknown 保存，
        // 非有限数值落库会被 Desk 按无效响应拒绝整页
        assertThat(content("""
            {"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"field":"messages",
            "value":{"messages":[{"from":"16505551234","id":"wamid.LOC3","timestamp":"1744344496",
            "type":"location","location":{"latitude":1e999,"longitude":2.5}}]}}]}],
            "object":"whatsapp_business_account"}"""))
            .isEqualTo(Map.of("type", "unknown", "originalType", "location"));
    }

    @Test
    void parseMapsButtonRepliesToTextAndOthersToUnknown() {
        // interactive button_reply/list_reply：用户点按的 title 即来语文本（§2.3）
        assertThat(content("""
            {"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"field":"messages",
            "value":{"messages":[{"from":"16505551234","id":"wamid.IR1","timestamp":"1744344496",
            "type":"interactive","context":{"from":"15550783881","id":"wamid.CTX1"},
            "interactive":{"type":"button_reply","button_reply":{"id":"cancel-button","title":"Cancel"}}}]}}]}]},
            "object":"whatsapp_business_account"}"""))
            .isEqualTo(Map.of("type", "text", "text", "Cancel"));

        assertThat(content("""
            {"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"field":"messages",
            "value":{"messages":[{"from":"16505551234","id":"wamid.IR2","timestamp":"1744344496",
            "type":"interactive","interactive":{"type":"list_reply","list_reply":{"id":"priority_express",
            "title":"Priority Mail Express","description":"Next Day to 2 Days"}}}]}}]}]},
            "object":"whatsapp_business_account"}"""))
            .isEqualTo(Map.of("type", "text", "text", "Priority Mail Express"));

        // 模板 quick-reply 点击（type:button，§2.3）：点按文本即来语文本
        assertThat(content("""
            {"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"field":"messages",
            "value":{"messages":[{"from":"16505551234","id":"wamid.BTN1","timestamp":"1744344496",
            "type":"button","context":{"from":"15550783881","id":"wamid.CTX2"},
            "button":{"payload":"Unsubscribe","text":"Unsubscribe"}}]}}]}]},
            "object":"whatsapp_business_account"}"""))
            .isEqualTo(Map.of("type", "text", "text", "Unsubscribe"));

        // reaction / contacts / unsupported / 未知类型：契约无对应形态，如实落 unknown
        assertThat(content("""
            {"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"field":"messages",
            "value":{"messages":[{"from":"16505551234","id":"wamid.RCT1","timestamp":"1744344496",
            "type":"reaction","reaction":{"message_id":"wamid.BASE1","emoji":"👍"}}]}}]}]},
            "object":"whatsapp_business_account"}"""))
            .isEqualTo(Map.of("type", "unknown", "originalType", "reaction"));

        assertThat(content("""
            {"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"field":"messages",
            "value":{"messages":[{"from":"16505551234","id":"wamid.CTC1","timestamp":"1744344496",
            "type":"contacts","contacts":[{"name":{"formatted_name":"Barbara J. Johnson",
            "first_name":"Barbara","last_name":"Johnson"},"org":{"company":"Social Tsunami"},
            "phones":[{"phone":"+1 (415) 555-0829","wa_id":"14125550829","type":"MOBILE"}]}]}]}}]}]},
            "object":"whatsapp_business_account"}"""))
            .isEqualTo(Map.of("type", "unknown", "originalType", "contacts"));

        assertThat(content("""
            {"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"field":"messages",
            "value":{"messages":[{"from":"16505551234","id":"wamid.UNS1","timestamp":"1744344496",
            "type":"unsupported","unsupported":{"type":"edit"},"errors":[{"code":131051,
            "title":"Message type unknown","message":"Message type unknown",
            "error_data":{"details":"Message type is currently not supported."}}]}]}}]}]},
            "object":"whatsapp_business_account"}"""))
            .isEqualTo(Map.of("type", "unknown", "originalType", "unsupported"));

        assertThat(content("""
            {"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"field":"messages",
            "value":{"messages":[{"from":"16505551234","id":"wamid.ORD1","timestamp":"1744344496",
            "type":"order","order":{"catalog_id":"1234","text":"order text"}}]}}]}]},
            "object":"whatsapp_business_account"}"""))
            .isEqualTo(Map.of("type", "unknown", "originalType", "order"));
    }

    @Test
    void parseKeepsVisitorNameOnlyFromMatchingSenderContact() {
        // contacts[].wa_id 与 from 不一致时不取名称
        Optional<ChannelInboundMessage> inbound = protocol.parse(CHANNEL_ID, """
            {"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"field":"messages",
            "value":{"messaging_product":"whatsapp","metadata":{},
            "contacts":[{"profile":{"name":"Someone Else"},"wa_id":"16505550000"}],
            "messages":[{"from":"16505551234","id":"wamid.NM1","timestamp":"1749416383",
            "type":"text","text":{"body":"hi"}}]}}]}],"object":"whatsapp_business_account"}""");
        assertThat(inbound).isPresent();
        assertThat(inbound.get().name()).isNull();

        // 无 contacts 数组同样只留 null 名称
        Optional<ChannelInboundMessage> anonymous = protocol.parse(CHANNEL_ID, """
            {"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"field":"messages",
            "value":{"messaging_product":"whatsapp","metadata":{},
            "messages":[{"from":"16505551234","id":"wamid.NM2","timestamp":"1749416383",
            "type":"text","text":{"body":"hi"}}]}}]}],"object":"whatsapp_business_account"}""");
        assertThat(anonymous).isPresent();
        assertThat(anonymous.get().name()).isNull();
    }

    @Test
    void parseRejectsUnusableEnvelopesAndMessagesMissingIdentity() {
        // 非 JSON、缺 entry、entry 非 JSON 数组：参数错误
        assertThatThrownBy(() -> protocol.parse(CHANNEL_ID, "not json"))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> protocol.parse(CHANNEL_ID, "{\"object\":\"whatsapp_business_account\"}"))
            .isInstanceOf(IllegalArgumentException.class);
        // 来语缺发送方身份 / 缺 wamid 幂等键：参数错误
        assertThatThrownBy(() -> protocol.parse(CHANNEL_ID, """
            {"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"field":"messages",
            "value":{"messages":[{"id":"wamid.X1","type":"text","text":{"body":"hi"}}]}}]}]}"""))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> protocol.parse(CHANNEL_ID, """
            {"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"field":"messages",
            "value":{"messages":[{"from":"16505551234","type":"text","text":{"body":"hi"}}]}}]}]}"""))
            .isInstanceOf(IllegalArgumentException.class);
    }

    private Map<String, Object> content(String body) {
        return protocol.parse(CHANNEL_ID, body).orElseThrow().content();
    }
}
