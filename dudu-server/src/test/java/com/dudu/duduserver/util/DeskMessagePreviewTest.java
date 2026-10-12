package com.dudu.duduserver.util;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 最后消息摘要规则验收：文本/媒体/链接/位置/引用各自的取值与 500 字截断。
 */
class DeskMessagePreviewTest {

    @Test
    void textTakesBodyVerbatim() {
        assertThat(DeskMessagePreview.of(Map.of("type", "text", "text", "你好，想问一下保修")))
            .isEqualTo("你好，想问一下保修");
    }

    @Test
    void mediaUsesTypeAndOptionalFileName() {
        assertThat(DeskMessagePreview.of(Map.of("type", "image",
            "media", Map.of("id", "m1", "kind", "image", "name", "cat.png"))))
            .isEqualTo("图片 cat.png");
        assertThat(DeskMessagePreview.of(Map.of("type", "image", "media", Map.of("id", "m1", "kind", "image"))))
            .isEqualTo("图片");
        assertThat(DeskMessagePreview.of(Map.of("type", "audio", "media", Map.of("kind", "audio", "name", "a.wav"))))
            .isEqualTo("语音 a.wav");
        assertThat(DeskMessagePreview.of(Map.of("type", "video", "media", Map.of("kind", "video"))))
            .isEqualTo("视频");
        assertThat(DeskMessagePreview.of(Map.of("type", "file", "media", Map.of("kind", "file", "name", "单据.pdf"))))
            .isEqualTo("文件 单据.pdf");
    }

    @Test
    void linkCardLocationAndQuoteUseTheirDisplayText() {
        assertThat(DeskMessagePreview.of(Map.of("type", "link", "title", "活动页", "url", "http://a")))
            .isEqualTo("活动页");
        assertThat(DeskMessagePreview.of(Map.of("type", "card", "kind", "order", "title", "订单卡片")))
            .isEqualTo("订单卡片");
        assertThat(DeskMessagePreview.of(Map.of("type", "location", "label", "广州塔", "latitude", 23.1d, "longitude", 113.3d)))
            .isEqualTo("广州塔");
        assertThat(DeskMessagePreview.of(Map.of("type", "quote", "text", "可以", "quotedText", "能发货吗")))
            .isEqualTo("可以");
    }

    @Test
    void unknownAndMissingTypesKeepEmptySummary() {
        assertThat(DeskMessagePreview.of(Map.of("type", "unknown", "originalType", "future"))).isEmpty();
        assertThat(DeskMessagePreview.of(Map.of())).isEmpty();
        assertThat(DeskMessagePreview.of(null)).isEmpty();
    }

    @Test
    void longTextIsTruncatedToColumnWidth() {
        String preview = DeskMessagePreview.of(Map.of("type", "text", "text", "x".repeat(600)));
        assertThat(preview).hasSize(500);
        assertThat(preview).isEqualTo("x".repeat(500));

        Map<String, Object> media = new LinkedHashMap<>();
        media.put("type", "file");
        media.put("media", Map.of("kind", "file", "name", "n".repeat(600)));
        assertThat(DeskMessagePreview.of(media)).hasSize(500);
    }
}
