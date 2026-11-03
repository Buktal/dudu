package com.dudu.duduserver.channel.kuaishou;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 快手智能客服回调协议验收（事实见 docs/research/channels/kuaishou.md §6.5.3）：
 * Ks-Sign = MD5(appKey + 原始 body) 常量时间比对；type=1 买家消息映射统一入站消息
 * （访客身份 fromUser.openId、requestId 作幂等标识、文本/卡片/图片按 contentType 映射），
 * 心跳与转接类事件只应答不落库；缺必填身份或幂等标识按参数错误拒绝。验签独立向量
 * 取 MD5("123456") = e10adc…883e。
 */
class KuaishouProtocolTest {

    private final KuaishouProtocol protocol = new KuaishouProtocol();

    @Test
    void verifyMatchesMd5OfAppKeyPlusRawBody() {
        // 独立向量：appKey="123" + body="456" → MD5("123456")
        KuaishouCredentials credentials = new KuaishouCredentials("123", null, null);

        assertThat(protocol.verify(credentials, "e10adc3949ba59abbe56e057f20f883e", "456")).isTrue();
        assertThat(protocol.verify(credentials, "E10ADC3949BA59ABBE56E057F20F883E", "456")).isTrue();
        assertThat(protocol.verify(credentials, "0".repeat(32), "456")).isFalse();
        assertThat(protocol.verify(credentials, " ", "456")).isFalse();
        assertThat(protocol.verify(null, "e10adc3949ba59abbe56e057f20f883e", "456")).isFalse();
    }

    @Test
    void parseMapsBuyerTextMessageToUnifiedInbound() {
        // §6.5.3 推送 body 字段表构造（官方未发布完整样例，字段名与结构逐字）
        var inbound = protocol.parse(31L, """
            {"requestId":"req-77","createTime":1659079893622,"generator":1,"type":1,
             "fromUser":{"nickName":"快手用户1234","role":1,"openId":"buyer-open-1"},
             "toUser":{"nickName":"旗舰店","role":2,"openId":"seller-open-1"},
             "message":{"contentType":1,"content":"{\\"text\\":\\"这个多少钱\\",\\"hintTag\\":{}}"},
             "context":{"sellerId":90001,"openId":"buyer-open-1","itemId":"10086",
              "orderId":"50012","orderStatus":30,"assistantOnlineStatus":1}}
            """).orElseThrow();

        assertThat(inbound.companyChannelId()).isEqualTo(31L);
        assertThat(inbound.externalUserId()).isEqualTo("buyer-open-1");
        assertThat(inbound.name()).isEqualTo("快手用户1234");
        assertThat(inbound.avatarUrl()).isNull();
        assertThat(inbound.channelFields()).isEmpty();
        assertThat(inbound.externalMessageId()).isEqualTo("req-77");
        assertThat(inbound.content()).isEqualTo(Map.of("type", "text", "text", "这个多少钱"));
    }

    @Test
    void parseMapsCardAndImageContentTypes() {
        // 商品卡片（§6.5.2）：content {"text": "$itemId"}，kind 与小红书 item 同构
        var item = protocol.parse(31L, push(1011, "{\"text\":\"$10086\"}")).orElseThrow();
        assertThat(item.content()).isEqualTo(Map.of("type", "card", "kind", "item", "externalId", "$10086"));

        // 订单卡片：content {"orderId": "12345"}
        var order = protocol.parse(31L, push(1012, "{\"orderId\":\"12345\"}")).orElseThrow();
        assertThat(order.content()).isEqualTo(Map.of("type", "card", "kind", "order", "externalId", "12345"));

        // 图片（contentType=2）：官方抹除 uri 后无素材引用，按 unknown 如实保存
        var image = protocol.parse(31L, push(2,
            "{\"uri\":\"\",\"width\":100,\"height\":100,\"contentLength\":1024}")).orElseThrow();
        assertThat(image.content()).isEqualTo(Map.of("type", "unknown", "originalType", "image"));

        // 卡片载荷缺失 externalId 时不填假值
        var bareItem = protocol.parse(31L, push(1011, "")).orElseThrow();
        assertThat(bareItem.content()).isEqualTo(Map.of("type", "card", "kind", "item"));

        // 枚举外 contentType 按数字原文落 unknown
        var other = protocol.parse(31L, push(1013, "{\"text\":\"x\"}")).orElseThrow();
        assertThat(other.content()).isEqualTo(Map.of("type", "unknown", "originalType", "1013"));
    }

    @Test
    void parseTreatsHeartbeatAndNonMessageEventsAsAnswerOnly() {
        // 心跳（推送基座机制）：只应答不落库
        assertThat(protocol.parse(31L, "{\"test\":true}")).isEmpty();

        // type=2 转接与 type=4 辅助模式事件不是访客消息
        assertThat(protocol.parse(31L, pushOfType(2))).isEmpty();
        assertThat(protocol.parse(31L, pushOfType(4))).isEmpty();
    }

    @Test
    void parseRejectsUnparsableOrIncompleteMessages() {
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
            () -> protocol.parse(31L, "not-json"));
        // 可识别消息缺少访客身份（fromUser.openId）或幂等标识（requestId）按参数错误拒绝
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
            () -> protocol.parse(31L, """
                {"requestId":"req-77","type":1,"fromUser":{"nickName":"n","role":1},
                 "message":{"contentType":1,"content":"{\\"text\\":\\"hi\\"}"},"context":{}}
                """));
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
            () -> protocol.parse(31L, """
                {"type":1,"fromUser":{"nickName":"n","role":1,"openId":"buyer-open-1"},
                 "message":{"contentType":1,"content":"{\\"text\\":\\"hi\\"}"},"context":{}}
                """));
        // 缺少消息体同样按参数错误拒绝
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
            () -> protocol.parse(31L, """
                {"requestId":"req-77","type":1,"fromUser":{"nickName":"n","role":1,"openId":"o"}}
                """));
    }

    // ---- 夹具 ----

    // 构造 type=1 买家消息推送（§6.5.3 字段表）
    private String push(int contentType, String content) {
        return """
            {"requestId":"req-77","createTime":1659079893622,"generator":1,"type":1,
             "fromUser":{"nickName":"快手用户1234","role":1,"openId":"buyer-open-1"},
             "toUser":{"nickName":"旗舰店","role":2,"openId":"seller-open-1"},
             "message":{"contentType":%d,"content":%s},
             "context":{"sellerId":90001,"openId":"buyer-open-1"}}
            """.formatted(contentType, quote(content));
    }

    private String pushOfType(int type) {
        return """
            {"requestId":"req-77","type":%d,
             "fromUser":{"nickName":"快手用户1234","role":1,"openId":"buyer-open-1"},
             "toUser":{"nickName":"旗舰店","role":2,"openId":"seller-open-1"},
             "transferList":[],"message":{"contentType":1,"content":"{}"},"context":{}}
            """.formatted(type);
    }

    // content 是 JSON 字符串字段：整体再作一层 JSON 字符串转义
    private String quote(String content) {
        return "\"" + content.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }
}
