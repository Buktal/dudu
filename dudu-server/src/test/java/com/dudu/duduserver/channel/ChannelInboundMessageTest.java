package com.dudu.duduserver.channel;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 渠道资料合并验收：未提供/空/有效三态区分、同名标签就地更新与顺序保持。
 */
class ChannelInboundMessageTest {

    @Test
    void mergesRenderedStatesAndKeepsUnrelatedFields() {
        List<Map<String, Object>> existing = List.of(
            Map.of("label", "手机号", "value", Map.of("state", "available", "value", "13800000000")),
            Map.of("label", "地区", "value", Map.of("state", "not-provided")));

        List<Map<String, Object>> merged = ChannelInboundMessage.mergeFields(existing, List.of(
            new ChannelInboundMessage.ChannelField("手机号", ""),
            new ChannelInboundMessage.ChannelField("备注", null),
            new ChannelInboundMessage.ChannelField("昵称", "小明")));

        assertThat(merged).containsExactly(
            Map.of("label", "手机号", "value", Map.of("state", "empty")),
            Map.of("label", "地区", "value", Map.of("state", "not-provided")),
            Map.of("label", "备注", "value", Map.of("state", "not-provided")),
            Map.of("label", "昵称", "value", Map.of("state", "available", "value", "小明")));
    }

    @Test
    void emptyExistingListAppendsAllUpdates() {
        List<Map<String, Object>> merged = ChannelInboundMessage.mergeFields(null,
            List.of(new ChannelInboundMessage.ChannelField("城市", "广州")));

        assertThat(merged).containsExactly(
            Map.of("label", "城市", "value", Map.of("state", "available", "value", "广州")));
    }
}
