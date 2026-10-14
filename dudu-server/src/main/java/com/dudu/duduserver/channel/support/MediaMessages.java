package com.dudu.duduserver.channel.support;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 统一消息体的媒体分支组装（契约第 4 节）：{type: kind, media: {kind, id, url?, name?}}。
 * 渠道侧只负责判定 kind、算出媒体标识并处理缺 id 的兜底（按 unknown 如实保存）——
 * 来源与编码各渠道不同；url/name 为空白表示渠道未下发，不放入（契约：渠道不提供的
 * 可选信息省略，不填假值）；media 用 LinkedHashMap 保持键序，落库 JSON 序列化稳定。
 */
public final class MediaMessages {

    private MediaMessages() {
    }

    public static Map<String, Object> of(String kind, String id, String url, String name) {
        Map<String, Object> media = new LinkedHashMap<>();
        media.put("kind", kind);
        media.put("id", id);
        putIfPresent(media, "url", url);
        putIfPresent(media, "name", name);
        return Map.of("type", kind, "media", media);
    }

    private static void putIfPresent(Map<String, Object> media, String key, String value) {
        String present = Texts.blankToNull(value);
        if (present != null) {
            media.put(key, present);
        }
    }
}
