package com.dudu.duduserver;

/**
 * WhatsApp 渠道集成测试的黄金密钥与官方报文形状（docs/research/channels/whatsapp.md
 * §4.1/§5.1/§5.2/§5.3/§5.6/§6 与 mock-pulse whatsapp golden 同源）：黄金签名与文本信封
 * 为 Node 交叉复算向量，逐字保持原字节序（value 在前、field 在后），验签正确性由
 * WhatsappProtocolTest 锚定；其余报文按官方样例同形构造。
 */
final class WhatsappGolden {

    // 官方 §5.1 metadata 示例账号与 mock-pulse 黄金密钥（whatsapp.md §4.1/§5.1）
    static final String APP_SECRET = "whatsapp_app_secret";
    static final String VERIFY_TOKEN = "meaty-hammer-7";
    static final String CHALLENGE = "1158201444251383";
    static final String PHONE_NUMBER_ID = "106540352242922";
    static final String MEDIA_ID = "1003383421387256";
    static final String WAMID_IN = "wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTRBNjU5OUFFRTAzODEwMTQ0RgA=";
    static final String WAMID_SENT = "wamid.SENT1";
    static final byte[] IMAGE_BYTES = "whatsapp-media-bytes".getBytes(java.nio.charset.StandardCharsets.UTF_8);

    // 官方 §5.1 信封（文本消息）与 Node 交叉复算签名（字段序不可变，签名对字节敏感）
    static final String GOLDEN_TEXT = "{\"object\":\"whatsapp_business_account\","
        + "\"entry\":[{\"id\":\"102290129340398\",\"changes\":[{\"value\":{\"messaging_product\":"
        + "\"whatsapp\",\"metadata\":{\"display_phone_number\":\"15550783881\",\"phone_number_id\":"
        + "\"" + PHONE_NUMBER_ID + "\"},\"contacts\":[{\"profile\":{\"name\":\"Sheena Nelson\"},"
        + "\"wa_id\":\"16505551234\"}],\"messages\":[{\"from\":\"16505551234\",\"id\":\"" + WAMID_IN
        + "\",\"timestamp\":\"1749416383\",\"type\":\"text\",\"text\":{\"body\":\"Does it come in "
        + "another color?\"}}]},\"field\":\"messages\"}]}]}";
    static final String GOLDEN_SIGNATURE =
        "sha256=d7cb4e2edfe5a785613849eeccb385976ef6e07b1032943a1a5fd785b13c28c3";

    // 官方 §5.3 受理响应与 §6 拒绝形状（错误码 131047：24 小时窗口外被拒）
    static final String SEND_OK = "{\"messaging_product\":\"whatsapp\",\"contacts\":[{"
        + "\"input\":\"+16315551234\",\"wa_id\":\"16315551234\"}],\"messages\":[{\"id\":\""
        + WAMID_SENT + "\"}]}";
    static final String SEND_REJECTED = "{\"error\":{\"message\":\"(#131047) Re-engagement message\","
        + "\"type\":\"OAuthException\",\"code\":131047,\"error_data\":{\"messaging_product\":\"whatsapp\","
        + "\"details\":\"Message failed to send because more than 24 hours have passed\"},"
        + "\"error_subcode\":2494055,\"error_user_title\":\"\",\"error_user_msg\":\"\",\"href\":\"\"}}";

    // 官方 §5.6 两步下载：第一步 meta 形状（url 为占位，替身运行时填真实地址）与媒体 id 失效拒绝形状
    static final String MEDIA_META = "{\"messaging_product\":\"whatsapp\",\"url\":\"%s\","
        + "\"mime_type\":\"image/jpeg\",\"sha256\":\"SfI=\",\"file_size\":\"20\",\"id\":\""
        + MEDIA_ID + "\"}";
    static final String MEDIA_ERROR = "{\"error\":{\"message\":\"Unsupported get request.\","
        + "\"type\":\"GraphMethodException\",\"code\":100,\"error_data\":{\"messaging_product\":"
        + "\"whatsapp\",\"details\":\"Media expired or not available\"}}}";

    private WhatsappGolden() {
    }

    // 官方信封：object → entry[] → changes[]（field=messages）→ value（metadata + contacts + messages[]）
    static String envelope(String from, String messageJson) {
        String messages = messageJson == null ? "[]" : "[" + messageJson + "]";
        String contacts = from == null ? "" : "\"contacts\":[{\"profile\":{\"name\":\"Sheena Nelson\"},"
            + "\"wa_id\":\"" + from + "\"}],";
        return "{\"object\":\"whatsapp_business_account\",\"entry\":[{\"id\":\"102290129340398\","
            + "\"changes\":[{\"field\":\"messages\",\"value\":{\"messaging_product\":\"whatsapp\","
            + "\"metadata\":{\"display_phone_number\":\"15550783881\",\"phone_number_id\":\""
            + PHONE_NUMBER_ID + "\"}," + contacts + "\"messages\":" + messages + "}}]}]}";
    }

    // 单条来语（官方 §2.3 字段序）：from/id/timestamp/type + 类型载荷
    static String message(String wamid, String type, String typeJson) {
        return "{\"from\":\"16505551234\",\"id\":\"" + wamid + "\",\"timestamp\":\"1749416383\","
            + "\"type\":\"" + type + "\"," + typeJson + "}";
    }
}
