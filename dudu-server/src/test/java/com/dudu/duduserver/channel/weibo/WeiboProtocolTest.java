package com.dudu.duduserver.channel.weibo;

import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 微博回调协议对拍（docs/research/channels/weibo.md §3.1、§4.1、§5）：签名密钥是 App
 * Secret 而非自定义 Token，官方黄金算例逐字作为测试向量；报文为 JSON 明文，按官方示例
 * 载荷原文解析为契约第 4 节统一消息体。
 */
class WeiboProtocolTest {

    // 官方黄金算例（新手接入指南页逐字）：拼接串 139702206182357155157xyz123xyz 的 sha1
    private static final String APP_SECRET = "xyz123xyz";
    private static final String TIMESTAMP = "1397022061823";
    private static final String NONCE = "57155157";
    private static final String SIGNATURE = "90e4c22c90a58f26526c2dd5b6c56c8822edeaa1";

    private final WeiboProtocol protocol = new WeiboProtocol();

    @Test
    void acceptsTheOfficialGoldenVectorAndRejectsTamperedOrPartialSignatures() {
        assertThat(protocol.verify(APP_SECRET, SIGNATURE, TIMESTAMP, NONCE)).isTrue();

        // 签名不符（伪造/篡改）与材料缺失都按校验失败处理，不猜测来源
        assertThat(protocol.verify(APP_SECRET, "0".repeat(40), TIMESTAMP, NONCE)).isFalse();
        assertThat(protocol.verify(APP_SECRET, null, TIMESTAMP, NONCE)).isFalse();
        assertThat(protocol.verify(null, SIGNATURE, TIMESTAMP, NONCE)).isFalse();
    }

    @Test
    void parsesTextMessageIntoUnifiedBodyWithSenderUid() {
        // 官方 §5.1 纯文本私信载荷原文：sender_id 为 int64 UID，无消息 ID 字段
        ChannelInboundMessage inbound = protocol.parse(3101L, """
            {
                "type": "text",
                "receiver_id": 1902538057,
                "sender_id": 2489518277,
                "created_at": "Mon Jul 16 18:09:20 +0800 2012",
                "text": "私信或留言内容",
                "data": {}
            }
            """).orElseThrow();

        assertThat(inbound.companyChannelId()).isEqualTo(3101L);
        assertThat(inbound.externalUserId()).isEqualTo("2489518277");
        assertThat(inbound.externalMessageId()).isNull();
        assertThat(inbound.direction()).isEqualTo(MessageDirectionEnum.INCOMING);
        assertThat(inbound.content()).isEqualTo(Map.of("type", "text", "text", "私信或留言内容"));
    }

    @Test
    void parsesPositionMessageIntoContractLocationWithNumericCoordinates() {
        // 官方 §5.2 位置私信载荷原文：经纬度是字符串，统一消息体按契约转数值
        ChannelInboundMessage inbound = protocol.parse(3101L, """
            {
                "type": "position",
                "receiver_id": 1902538057,
                "sender_id": 2489518277,
                "created_at": "Mon Jul 16 18:09:20 +0800 2012",
                "text": "我在这里: http://t.cn/zQgLLYO",
                "data": {
                    "longitude": "116.308586",
                    "latitude": "39.982525"
                  }
            }
            """).orElseThrow();

        assertThat(inbound.content()).containsEntry("type", "location");
        assertThat(inbound.content().get("latitude")).isEqualTo(39.982525d);
        assertThat(inbound.content().get("longitude")).isEqualTo(116.308586d);

        // 坐标溢出为非有限值（parseDouble 对 1e999 不抛异常）时按 unknown 如实保存，
        // 非有限数值落库会被 Desk 按无效响应拒绝整页
        ChannelInboundMessage overflow = protocol.parse(3101L, """
            {
                "type": "position",
                "receiver_id": 1902538057,
                "sender_id": 2489518277,
                "created_at": "Mon Jul 16 18:09:20 +0800 2012",
                "text": "我在这里: http://t.cn/zQgLLYO",
                "data": {
                    "longitude": "1e999",
                    "latitude": "39.982525"
                  }
            }
            """).orElseThrow();
        assertThat(overflow.content())
            .isEqualTo(Map.of("type", "unknown", "originalType", "position"));
    }

    @Test
    void parsesVoiceAndImageMessagesAroundTheReceiverSideFileId() {
        // 官方 §5.3/§5.4 载荷原文：tovfid 为接收者侧文件 ID（msget 下载用），vfid 是发送者侧
        ChannelInboundMessage voice = protocol.parse(3101L, """
            {
                "type": "voice",
                "receiver_id": 1902538057,
                "sender_id": 2489518277,
                "created_at": "Mon Jul 16 18:09:20 +0800 2012",
                "text": "发了一个语音消息",
                "data": {
                    "vfid": 821804459,
                    "tovfid": 821804469
                }
            }
            """).orElseThrow();
        assertThat(voice.content()).isEqualTo(Map.of("type", "audio",
            "media", Map.of("kind", "audio", "id", "821804469")));

        ChannelInboundMessage image = protocol.parse(3101L, """
            {
                "type": "image",
                "receiver_id": 1902538057,
                "sender_id": 2489518277,
                "created_at": "Mon Jul 16 18:09:20 +0800 2012",
                "text": "发了一张图片",
                "data": {
                    "vfid": 821804459,
                    "tovfid": 821804469
                }
            }
            """).orElseThrow();
        assertThat(image.content()).isEqualTo(Map.of("type", "image",
            "media", Map.of("kind", "image", "id", "821804469")));
    }

    @Test
    void eventPushesOnlyAcknowledgeWithoutVisitorData() {
        // 官方 §5.5/§5.7/§5.9/§5.10 载荷原文：事件推送不是访客消息，只应答不保存
        assertThat(protocol.parse(3101L, event("关注事件消息", "\"subtype\": \"follow\""))).isEmpty();
        assertThat(protocol.parse(3101L, event("扫描二维码",
            "\"subtype\": \"scan_follow\",\n        \"key\": \"action_name_scene_id\",\n        \"ticket\": \"TICKET\"")))
            .isEmpty();
        assertThat(protocol.parse(3101L, event("自定义菜单点击事件消息",
            "\"subtype\": \"click\",\n        \"key\": \"EVENT_KEY\""))).isEmpty();
        assertThat(protocol.parse(3101L, event("自定义菜单跳转链接事件消息",
            "\"subtype\": \"view\",\n        \"key\": \"url\""))).isEmpty();
    }

    @Test
    void mentionPushIsAlsoEventSideAndOnlyAcknowledged() {
        // 官方 §2.2：被@消息外层 type 是 mention（subtype status/comment），归事件侧只应答
        assertThat(protocol.parse(3101L, event("被@的微博或评论文本信息",
            "\"subtype\": \"status\",\n        \"key\": \"MENTION_KEY\""))).isEmpty();
    }

    @Test
    void unknownMessageTypeIsStoredHonestlyInsteadOfGuessed() {
        // 官方兼容性要求「出现未知类型时可忽略」，无法映射的按 unknown 如实落库不猜内容
        ChannelInboundMessage inbound = protocol.parse(3101L, """
            {
                "type": "future_thing",
                "receiver_id": 1902538057,
                "sender_id": 2489518277,
                "created_at": "Mon Jul 16 18:09:20 +0800 2012",
                "text": "未知类型载荷",
                "data": {}
            }
            """).orElseThrow();
        assertThat(inbound.content()).isEqualTo(Map.of("type", "unknown", "originalType", "future_thing"));
    }

    @Test
    void rejectsMalformedPayloadAndMissingSenderHonestly() {
        // 报文无法解析与缺少 sender_id（发送方身份）都由调用方按参数错误拒绝
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
            () -> protocol.parse(3101L, "not json"));
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
            () -> protocol.parse(3101L, "{\"type\": \"text\", \"text\": \"没有发送方\"}"));
    }

    // §5 事件载荷公共骨架：type:"event"，data 内容按事件各异
    private String event(String text, String dataFields) {
        return """
            {
                "type": "event",
                "receiver_id": 1902538057,
                "sender_id": 2489518277,
                "created_at": "Mon Jul 16 18:09:20 +0800 2012",
                "text": "%s",
                "data": {
                    %s
                }
            }
            """.formatted(text, dataFields);
    }
}

