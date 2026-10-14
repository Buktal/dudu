package com.dudu.duduserver.channel.support;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 统一消息体组装（契约第 4 节）：渠道侧负责判定类型、算出渠道侧字段并处理缺关键
 * 标识的兜底——来源与编码各渠道不同；这里只收敛各渠道逐字重复的消息体形状。
 * media 分支 {type: kind, media: {kind, id, url?, name?}}：url/name 为空白表示渠道
 * 未下发，不放入（契约：渠道不提供的可选信息省略，不填假值）；media 用 LinkedHashMap
 * 保持键序，落库 JSON 序列化稳定。unknown 分支如实保存渠道原类型，空白按 unknown。
 */
public final class MessageBodies {

    private MessageBodies() {
    }

    public static Map<String, Object> media(String kind, String id, String url, String name) {
        Map<String, Object> media = new LinkedHashMap<>();
        media.put("kind", kind);
        media.put("id", id);
        putIfPresent(media, "url", url);
        putIfPresent(media, "name", name);
        return Map.of("type", kind, "media", media);
    }

    public static Map<String, Object> unknown(String originalType) {
        return Map.of("type", "unknown", "originalType", Texts.isBlank(originalType)
            ? "unknown" : originalType);
    }

    private static void putIfPresent(Map<String, Object> media, String key, String value) {
        String present = Texts.blankToNull(value);
        if (present != null) {
            media.put(key, present);
        }
    }
}
