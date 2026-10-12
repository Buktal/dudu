package com.dudu.duduserver.util;

import java.util.Map;

/**
 * 最后消息摘要生成：按契约第 1 节规则从统一消息体提取列表与卡片摘要——文本取正文，
 * 图片/音视频/文件用类型和文件名，链接/卡片取标题，位置取名称，引用取回复文字；
 * 最多 500 字，不复制完整正文。
 */
public final class DeskMessagePreview {

    // visitor.last_message_preview 列宽
    private static final int MAX_LENGTH = 500;

    // 媒体、链接、位置与引用摘要的空缺分隔
    private static final String JOINER = " ";

    private DeskMessagePreview() {
    }

    public static String of(Map<String, Object> content) {
        String preview = switch (type(content)) {
            case "text" -> text(content.get("text"));
            case "image" -> media("图片", content.get("media"));
            case "audio" -> media("语音", content.get("media"));
            case "video" -> media("视频", content.get("media"));
            case "file" -> media("文件", content.get("media"));
            case "link" -> text(content.get("title"));
            case "card" -> text(content.get("title"));
            case "location" -> text(content.get("label"));
            case "quote" -> text(content.get("text"));
            // 未接入的类型不编造摘要文案，保留空摘要
            default -> "";
        };
        return preview.length() > MAX_LENGTH ? preview.substring(0, MAX_LENGTH) : preview;
    }

    private static String type(Map<String, Object> content) {
        return content == null ? "" : text(content.get("type"));
    }

    // 图片/文件/音视频用类型和文件名；渠道未提供文件名时只有类型
    private static String media(String label, Object value) {
        String name = value instanceof Map<?, ?> media ? text(media.get("name")) : "";
        return name.isEmpty() ? label : label + JOINER + name;
    }

    private static String text(Object value) {
        return value instanceof String text ? text : "";
    }
}
