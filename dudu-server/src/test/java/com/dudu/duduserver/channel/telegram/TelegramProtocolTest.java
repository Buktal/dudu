package com.dudu.duduserver.channel.telegram;

import com.dudu.duduserver.channel.ChannelReceiveResult;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Telegram Update 信封解析与恒等头验签验证（docs/research/channels/telegram.md §2、§4.1、
 * §5.2）：官方 Webhook 自测文本消息样本逐字解析为统一入站消息（update_id 作幂等键），
 * 非 message 事件字段只应答不落库，媒体消息按契约映射、未知类型如实落 unknown，缺身份
 * 与缺 update_id 的报文按参数错误拒绝；验签 = 恒等头与配置 secretToken 原样字符串
 * 常量时间相等比较（无 HMAC 无签名无 query 参数）。
 */
class TelegramProtocolTest {

    // 官方 §5.2 文本消息自测样本（webhooks 指南逐字，含原文缩进与冒号后空格）
    private static final String GOLDEN_TEXT_UPDATE = """
        {
        "update_id":10000,
        "message":{
            "date":1441645532,
            "chat":{
               "last_name":"Test Lastname",
               "id":1111111,
               "type": "private",
               "first_name":"Test Firstname",
               "username":"Testusername"
            },
            "message_id":1365,
            "from":{
               "last_name":"Test Lastname",
               "id":1111111,
               "first_name":"Test Firstname",
               "username":"Testusername"
            },
            "text":"/start"
        }
        }""";

    private final TelegramProtocol protocol = new TelegramProtocol();

    @Test
    void parsesGoldenTextUpdateIntoUnifiedInboundMessage() {
        ChannelReceiveResult result = protocol.parse(4107L, GOLDEN_TEXT_UPDATE);

        assertThat(result.response().status()).isEqualTo(200);
        assertThat(result.message()).isNotNull();
        // 发送方身份取 from.id（可超 32 位按 64 位处理），姓名取 first/last name 拼接
        assertThat(result.message().externalUserId()).isEqualTo("1111111");
        assertThat(result.message().name()).isEqualTo("Test Firstname Test Lastname");
        assertThat(result.message().avatarUrl()).isNull();
        assertThat(result.message().channelFields()).isEmpty();
        // 幂等以 update_id 为准
        assertThat(result.message().externalMessageId()).isEqualTo("10000");
        assertThat(result.message().direction()).isEqualTo(MessageDirectionEnum.INCOMING);
        assertThat(result.message().content()).isEqualTo(Map.of("type", "text", "text", "/start"));
    }

    @Test
    void answersEventOnlyUpdatesWithoutVisitorData() {
        // 官方 §5.2 callback_query 自测样本逐字（按钮点击）：事件族只应答不落库
        String callbackQuery = """
            {
            "update_id":10000,
            "callback_query":{
                "id": "4382bfdwdsb323b2d9",
                "from":{
                   "last_name":"Test Lastname",
                   "type": "private",
                   "id":1111111,
                   "first_name":"Test Firstname",
                   "username":"Testusername"
                },
                "data": "Data from button callback",
                "inline_message_id": "1234csdbsk4839"
            }
            }""";

        ChannelReceiveResult result = protocol.parse(4107L, callbackQuery);

        assertThat(result.response().status()).isEqualTo(200);
        assertThat(result.message()).isNull();
        // 其余事件字段（edited_message、channel_post、未来新增类型）同样只应答
        assertThat(protocol.parse(4107L, "{\"update_id\":10001,\"edited_message\":{}}").message()).isNull();
        assertThat(protocol.parse(4107L, "{\"update_id\":10002,\"future_event\":{}}").message()).isNull();
    }

    @Test
    void verifiesSecretTokenByConstantTimeEquality() {
        assertThat(protocol.verify("dudu-secret-token", "dudu-secret-token")).isTrue();
        // 头缺失、值不符都按校验失败（§4.1：纯回显比对，无 HMAC 无 query 参数）
        assertThat(protocol.verify(null, "dudu-secret-token")).isFalse();
        assertThat(protocol.verify("dudu-secret-tokn", "dudu-secret-token")).isFalse();
        assertThat(protocol.verify("", "dudu-secret-token")).isFalse();
    }

    @Test
    void mapsMediaMessagesByContractWithFileIdAsReference() {
        // photo：多分辨率数组取最大一档 file_id（官方 api#update PhotoSize 语义）
        assertThat(content("""
            {"date":1,"from":{"id":1111111,"first_name":"Test"},
             "photo":[{"width":90,"height":90,"file_id":"photo-small"},
                      {"width":320,"height":320,"file_id":"photo-mid"},
                      {"width":800,"height":600,"file_id":"photo-large"}]}
            """)).isEqualTo(Map.of("type", "image",
            "media", Map.of("kind", "image", "id", "photo-large")));
        // voice → audio；audio → audio 带 title 名；document → file 带 file_name
        assertThat(content("""
            {"date":1,"from":{"id":1111111,"first_name":"Test"},
             "voice":{"duration":3,"mime_type":"audio/ogg","file_id":"voice-1"}}
            """)).isEqualTo(Map.of("type", "audio",
            "media", Map.of("kind", "audio", "id", "voice-1")));
        assertThat(content("""
            {"date":1,"from":{"id":1111111,"first_name":"Test"},
             "audio":{"duration":203,"title":"Sleep","file_name":"sleep.mp3","file_id":"audio-1"}}
            """)).isEqualTo(Map.of("type", "audio",
            "media", Map.of("kind", "audio", "id", "audio-1", "name", "Sleep")));
        assertThat(content("""
            {"date":1,"from":{"id":1111111,"first_name":"Test"},
             "document":{"file_name":"a.pdf","mime_type":"application/pdf","file_id":"doc-1"}}
            """)).isEqualTo(Map.of("type", "file",
            "media", Map.of("kind", "file", "id", "doc-1", "name", "a.pdf")));
        // video 与视频笔记 → video；video_note 无文件名不填假值
        assertThat(content("""
            {"date":1,"from":{"id":1111111,"first_name":"Test"},
             "video":{"duration":52,"file_name":"clip.mp4","file_id":"video-1"}}
            """)).isEqualTo(Map.of("type", "video",
            "media", Map.of("kind", "video", "id", "video-1", "name", "clip.mp4")));
        assertThat(content("""
            {"date":1,"from":{"id":1111111,"first_name":"Test"},
             "video_note":{"duration":7,"file_id":"note-1"}}
            """)).isEqualTo(Map.of("type", "video",
            "media", Map.of("kind", "video", "id", "note-1")));
    }

    @Test
    void landsUnmappableMessageContentsAsUnknownWithHonestOriginalType() {
        // sticker 等契约外内容按字段名如实标注
        assertThat(content("""
            {"date":1,"from":{"id":1111111,"first_name":"Test"},
             "sticker":{"width":512,"file_id":"sticker-1"}}
            """)).isEqualTo(Map.of("type", "unknown", "originalType", "sticker"));
        // 纯服务消息（无内容字段）按 message 如实标注
        assertThat(content("""
            {"date":1,"from":{"id":1111111,"first_name":"Test"},
             "new_chat_members":[{"id":2,"first_name":"New"}]}
            """)).isEqualTo(Map.of("type", "unknown", "originalType", "new_chat_members"));
    }

    @Test
    void rejectsUnusableUpdatesAsBadRequestMaterial() {
        // 缺幂等键、缺发送方身份、非 JSON 报文都按参数错误拒绝（渠道会重试后放弃）
        assertThatThrownBy(() -> protocol.parse(4107L, "{\"message\":{\"text\":\"hi\"}}"))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> protocol.parse(4107L,
            "{\"update_id\":10000,\"message\":{\"text\":\"hi\"}}"))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> protocol.parse(4107L, "not-json"))
            .isInstanceOf(IllegalArgumentException.class);
    }

    // 造一条 message 型 Update（update_id 固定 10000），取其统一消息体
    private Map<String, Object> content(String messagePayload) {
        ChannelReceiveResult result = protocol.parse(4107L,
            "{\"update_id\":10000,\"message\":" + messagePayload + "}");
        assertThat(result.message()).isNotNull();
        return result.message().content();
    }
}
