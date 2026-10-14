package com.dudu.duduserver.channel.douyin;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 抖音回调验签验收（事实见 docs/research/channels/douyin.md §4.1）：
 * X-Douyin-Signature = 小写 hex sha1(client_secret + 原始 body 字节)，
 * 握手与事件推送走同一验签；独立来源取 FIPS 180-1 测试向量 sha1("abc")。
 */
class DouyinProtocolTest {

    private final DouyinProtocol protocol = new DouyinProtocol();

    @Test
    void verifyMatchesLowercaseHexSha1OfSecretPlusRawBody() {
        // FIPS 180-1：sha1("abc") = a9993e36…d89d（mock-pulse 测试同源向量）
        assertThat(sha1("abc")).isEqualTo("a9993e364706816aba3e25717850c26c9cd0d89d");

        String body = "{\"event\":\"verify_webhook\",\"client_key\":\"asdfavetgbvasf\","
            + "\"content\":{\"challenge\":12345}}";
        String signature = sha1("9e096e3a2a8b4e0f9c0f" + body);

        assertThat(protocol.verify(credentials(), signature, body)).isTrue();
    }

    @Test
    void verifyRejectsTamperedSignatureOrWrongSecret() {
        String body = "{\"event\":\"im_receive_msg\"}";
        assertThat(protocol.verify(credentials(), sha1("other-secret" + body), body)).isFalse();
        assertThat(protocol.verify(credentials(),
            "0".repeat(40), body)).isFalse();
        assertThat(protocol.verify(credentials(), "", body)).isFalse();
        assertThat(protocol.verify(null, sha1("9e096e3a2a8b4e0f9c0f" + body), body)).isFalse();
    }

    @Test
    void handshakeEchoesNumericChallengeAsTextJson() {
        // 官方 §3.1 握手样例：content 为 object、challenge 为数字；回显体必须保持数字
        String handshake = "{\"event\":\"verify_webhook\",\"client_key\":\"asdfavetgbvasf\","
            + "\"content\":{\"challenge\":12345}}";
        assertThat(protocol.challengeEcho(handshake)).isEqualTo("{\"challenge\":12345}");
    }

    @Test
    void handshakeReturnsNullForEventPushesAndThrowsOnMissingChallenge() {
        assertThat(protocol.challengeEcho(
            "{\"event\":\"im_receive_msg\",\"content\":{}}")).isNull();

        // challenge 缺失无法回显：按参数错误拒绝，不猜同值
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
            () -> protocol.challengeEcho("{\"event\":\"verify_webhook\",\"content\":{}}"));
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
            () -> protocol.challengeEcho("{\"event\":\"verify_webhook\","
                + "\"content\":{\"challenge\":\"12345\"}}"));
        // content 官方为 object，字符串值无法回显同样按参数错误拒绝
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
            () -> protocol.challengeEcho("{\"event\":\"verify_webhook\",\"content\":\"x\"}"));
    }

    @Test
    void parseMapsTextGoldenSampleToUnifiedBodyWithReplyContext() {
        // 官方 §5.10 黄金样本逐字（mock-pulse dy-text 同源）：身份取 user_infos、
        // 回复三要素随消息留存（server_message_id:conversation_short_id:信封 to_user_id）
        var inbound = protocol.parse(77L, goldenText()).orElseThrow();

        assertThat(inbound.companyChannelId()).isEqualTo(77L);
        assertThat(inbound.externalUserId()).isEqualTo("aaa-ae9b-4dbf-add1-bf67e4093fab");
        assertThat(inbound.name()).isEqualTo("刘东");
        assertThat(inbound.avatarUrl()).startsWith("https://p3.douyinpic.com/aweme/720x720/");
        assertThat(inbound.direction()).isEqualTo(com.dudu.duduserver.constant.MessageDirectionEnum.INCOMING);
        assertThat(inbound.externalMessageId())
            .isEqualTo("@9Vxc1/yDU8sqaS+gN4koEc7912foPPyAPpF2rgykLFgbafb560zdRmYqig357zEBmWXVPshhwyd/y/7BQpXy/w=="
                + ":@9Vxc1/yDU8sqaS+gN4koEc7912foPPiLPZVyrQmgKVQabPH460zdRmYqig357zEBMaXjKvvhvwY02ISB7llsWQ=="
                + ":aaa-7ae0-4399-914a-5eb1df5861ba");
        assertThat(inbound.content()).containsEntry("type", "text").containsEntry("text", "捷途70");
    }

    @Test
    void parseMapsMediaGoldenSamplesWithChannelIdentifiersOrDerivedStableIds() {
        // §5.7 图片：载荷不含素材标识 → 按「消息 ID:媒体下标」派生稳定标识
        var image = protocol.parse(77L, golden("""
            {"event":"im_receive_msg","client_key":"asdfavetgbvasf",
             "from_user_id":"ac6479a5-d7a6-4018-84be-c29bfc00000",
             "to_user_id":"8067f050-f8cf-4fa3-9357-c29bfc00000",
             "content":{"conversation_short_id":"@conv","server_message_id":"@msg","conversation_type":1,
             "create_time":1656571939562,"message_type":"image","index":"1672502407220000"}}
            """)).orElseThrow();
        assertThat(image.content()).containsEntry("type", "image");
        assertThat((java.util.Map<String, Object>) image.content().get("media"))
            .containsEntry("kind", "image").containsEntry("id", "@msg:0");

        // §5.8 视频分享：item_id 即渠道素材标识
        var video = protocol.parse(77L, golden("""
            {"event":"im_receive_msg","client_key":"asdfavetgbvasf",
             "from_user_id":"eeb0ea9b-bed4-4b70-913d-c29bfc00000",
             "to_user_id":"8067f050-f8cf-4fa3-9357-c29bfc00000",
             "content":{"conversation_short_id":"@conv","server_message_id":"@msg","conversation_type":1,
             "create_time":1656671771668,"message_type":"video",
             "item_id":"@72NwHyW53+MNggFhRkwGuX1ntuc2RfUyVnKfdTzwU0F0CtjUrU9MpJSYEVV6/2hKy3NMVbBhh6BW27IsDFieLg==",
             "index":"1672502407220000"}}
            """)).orElseThrow();
        assertThat(video.content()).containsEntry("type", "video");
        assertThat((java.util.Map<String, Object>) video.content().get("media")).containsEntry("kind", "video")
            .containsEntry("id", "@72NwHyW53+MNggFhRkwGuX1ntuc2RfUyVnKfdTzwU0F0CtjUrU9MpJSYEVV6/2hKy3NMVbBhh6BW27IsDFieLg==");

        // §5.6 表情：resource_url 空串无直链 → 派生标识、不填假 url
        var emoji = protocol.parse(77L, golden("""
            {"event":"im_receive_msg","client_key":"asdfavetgbvasf",
             "from_user_id":"eeb0ea9b-bed4-4b70-913d-c29bfc00000",
             "to_user_id":"aaa-7ae0-4399-914a-5eb1df5861ba",
             "content":{"conversation_short_id":"@conv","server_message_id":"@msg","conversation_type":1,
             "create_time":1656671771668,"message_type":"emoji","resource_type":"gif",
             "resource_width":450,"resource_height":450,"resource_url":"","index":"1672502407220000"}}
            """)).orElseThrow();
        assertThat((java.util.Map<String, Object>) emoji.content().get("media"))
            .containsEntry("kind", "image").containsEntry("id", "@msg:0")
            .doesNotContainKey("url");

        // resource_url 非空：直链即渠道素材标识并附 url
        var sticker = protocol.parse(77L, golden("""
            {"event":"im_receive_msg","client_key":"asdfavetgbvasf",
             "from_user_id":"eeb0ea9b-bed4-4b70-913d-c29bfc00000",
             "to_user_id":"aaa-7ae0-4399-914a-5eb1df5861ba",
             "content":{"conversation_short_id":"@conv","server_message_id":"@msg","message_type":"emoji",
             "resource_url":"https://p3.douyinpic.com/emoji.gif"}}
            """)).orElseThrow();
        assertThat((java.util.Map<String, Object>) sticker.content().get("media"))
            .containsEntry("kind", "image").containsEntry("id", "https://p3.douyinpic.com/emoji.gif")
            .containsEntry("url", "https://p3.douyinpic.com/emoji.gif");
    }

    @Test
    void parseMapsRetainCardAndUnknownTypes() {
        // §5.9 留资卡片：card 分支 kind=retain_consult_card，card_id 作 externalId
        var card = protocol.parse(77L, golden("""
            {"event":"im_receive_msg","client_key":"asdfavetgbvasf",
             "from_user_id":"ac6479a5-d7a6-4018-84be-c29bfc00000",
             "to_user_id":"8067f050-f8cf-4fa3-9357-c29bfc00000",
             "content":{"conversation_short_id":"@conv","server_message_id":"@msg","conversation_type":1,
             "create_time":1656571939562,"message_type":"retain_consult_card","index":"1672502407220000",
             "card_id":"@72MqAjfymKYS1xNrB0sG4X1iidgOeMsMbUSpQwLJb3kYzJh7eXsSr5+aH2GTsvEv","card_status":2,
             "card_data":[{"label":"姓名","value":"Tonality"},{"label":"手机号","value":"12345678901"}]}}
            """)).orElseThrow();
        assertThat(card.content()).containsEntry("type", "card").containsEntry("kind", "retain_consult_card")
            .containsEntry("externalId", "@72MqAjfymKYS1xNrB0sG4X1iidgOeMsMbUSpQwLJb3kYzJh7eXsSr5+aH2GTsvEv");

        // message_type 枚举外的类型按 unknown 如实保存（官方 §2.2 含 other）
        var other = protocol.parse(77L, golden("""
            {"event":"im_receive_msg","client_key":"asdfavetgbvasf",
             "from_user_id":"u1","to_user_id":"u2",
             "content":{"server_message_id":"@msg","conversation_short_id":"@conv","message_type":"other"}}
            """)).orElseThrow();
        assertThat(other.content()).containsEntry("type", "unknown").containsEntry("originalType", "other");
    }

    @Test
    void parseTreatsStringContentDualFormAndNonMessageEventsAsAnswerOnly() {
        // 双形态兼容：im_receive_msg 的 content 若为 JSON 字符串同样解析（票面要点 2）
        var stringContent = protocol.parse(77L, golden("""
            {"event":"im_receive_msg","client_key":"asdfavetgbvasf",
             "from_user_id":"u1","to_user_id":"u2",
             "content":"{\\"server_message_id\\":\\"@msg\\",\\"conversation_short_id\\":\\"@conv\\",
             \\"message_type\\":\\"text\\",\\"text\\":\\"你好\\"}"}
            """)).orElseThrow();
        assertThat(stringContent.content()).containsEntry("type", "text").containsEntry("text", "你好");

        // im_send_msg / im_enter_direct_msg（content 为 JSON 字符串）/ 已读事件只应答不落库
        assertThat(protocol.parse(77L, golden("""
            {"event":"im_send_msg","client_key":"asdfavetgbvasf","from_user_id":"u1","to_user_id":"u2",
             "content":{"server_message_id":"@msg","message_type":"text","text":"回显"}}
            """))).isEmpty();
        assertThat(protocol.parse(77L, golden("""
            {"event":"im_enter_direct_msg","client_key":"aaaoqobz68a71u1",
             "from_user_id":"aaa-8a0b-4c0f-b04f-feba0e909113","to_user_id":"aaa-81ec-424c-b738-8693eeaf53ea",
             "content":"{\\"conversation_short_id\\":\\"@c\\",\\"server_message_id\\":\\"@m\\",
             \\"conversation_type\\":1,\\"create_time\\":1681303286088,\\"scene_type\\":4}"}
            """))).isEmpty();
        assertThat(protocol.parse(77L, golden("""
            {"event":"im_message_read","client_key":"ttddf8ab4542c7d76601","from_user_id":"_000f9",
             "to_user_id":"_000bf","content":{"conversation_short_id":"@c","index":"1672502407220000",
             "conversation_type":1,"read_open_id":"_000bf"}}
            """))).isEmpty();
    }

    @Test
    void parseRejectsMessagesWithoutVisitorIdentity() {
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
            () -> protocol.parse(77L, golden("""
                {"event":"im_receive_msg","client_key":"asdfavetgbvasf",
                 "content":{"server_message_id":"@msg","conversation_short_id":"@conv","message_type":"text"}}
                """)));
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
            () -> protocol.parse(77L, "not-json"));
    }

    // 官方 §5.10 IM 文本消息完整示例（含 user_infos，逐字）
    private String goldenText() {
        return """
            {"event":"im_receive_msg","client_key":"asdfavetgbvasf",
             "from_user_id":"aaa-ae9b-4dbf-add1-bf67e4093fab",
             "to_user_id":"aaa-7ae0-4399-914a-5eb1df5861ba",
             "content":{"conversation_short_id":"@9Vxc1/yDU8sqaS+gN4koEc7912foPPiLPZVyrQmgKVQabPH460zdRmYqig357zEBMaXjKvvhvwY02ISB7llsWQ==",
             "server_message_id":"@9Vxc1/yDU8sqaS+gN4koEc7912foPPyAPpF2rgykLFgbafb560zdRmYqig357zEBmWXVPshhwyd/y/7BQpXy/w==",
             "conversation_type":1,"create_time":1681303285997,"message_type":"text","source":"","text":"捷途70",
             "index":"1672502407220000",
             "user_infos":[
               {"open_id":"aaa-ae9b-4dbf-add1-bf67e4093fab","nick_name":"刘东",
                "avatar":"https://p3.douyinpic.com/aweme/720x720/xxxxx-avatar/mosaic-legacy_3795_3047680722.jpeg?from=3782654143"},
               {"open_id":"aaa-7ae0-4399-914a-5eb1df5861ba","nick_name":"毕节--捷途万丰店",
                "avatar":"https://p3.douyinpic.com/aweme/720x720/xxxxxx-avatar/tos-cn-avt-0015_6c9ae9afb4e62e2263f98809e3dc5b6a.jpeg?from=3782654143"}]}}
            """;
    }

    // 压平测试内联 JSON 的换行缩进，便于逐字书写官方样本
    private String golden(String json) {
        return json.replaceAll("\\s+", " ");
    }

    private DouyinCredentials credentials() {
        return new DouyinCredentials("asdfavetgbvasf", "9e096e3a2a8b4e0f9c0f", null);
    }

    private String sha1(String value) {
        try {
            return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-1").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
