package com.dudu.duduserver.channel.support;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 微信 XML 协议族（公众号/企业微信/小程序，事实见 docs/research/channels/wechat-mp.md、
 * wecom.md、wechat-mini.md）普通消息体的共用映射：三渠道报文字段同名同义（MediaId/PicUrl、
 * Location_X/Location_Y/Label、Url/Title/Description），逐字重复的映射收敛到此处，按契约
 * 第 4 节组装统一消息体。只收敛映射本身，不判定 MsgType——类型判定与调用时机留各渠道
 * Protocol。
 */
public final class WechatXmlBodies {

    // link 报文的 MsgType 字面值，缺 url 兜底 unknown 时如实记录原始类型
    private static final String MSG_TYPE_LINK = "link";

    private WechatXmlBodies() {
    }

    // 媒体标识取渠道 MediaId；只有公开链接时用「消息 ID:媒体下标」派生稳定标识；
    // 两者都没有时契约第 4 节要求媒体引用必有 id，没有可如实表达的引用，按 unknown 如实保存不填假值
    public static Map<String, Object> media(String kind, String msgType, String mediaId, String url, String messageId) {
        String id = Texts.blankToNull(mediaId);
        if (id == null) {
            String messageScoped = Texts.blankToNull(messageId);
            if (messageScoped == null) {
                return MessageBodies.unknown(msgType);
            }
            id = messageScoped + ":0";
        }
        return MessageBodies.media(kind, id, url, null);
    }

    // 官方定义 Location_X 为纬度、Location_Y 为经度
    public static Map<String, Object> location(Map<String, String> fields) {
        String label = Texts.blankToNull(fields.get("Label"));
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("type", "location");
        if (label != null) {
            content.put("label", label);
        }
        content.put("latitude", Coordinates.parse(fields.get("Location_X")));
        content.put("longitude", Coordinates.parse(fields.get("Location_Y")));
        return content;
    }

    // 外链消息缺 url 时没有可如实表达的引用，按 unknown 如实保存，title/description 省略不填假值
    public static Map<String, Object> link(Map<String, String> fields) {
        String url = Texts.blankToNull(fields.get("Url"));
        if (url == null) {
            return MessageBodies.unknown(MSG_TYPE_LINK);
        }
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("type", "link");
        String title = Texts.blankToNull(fields.get("Title"));
        if (title != null) {
            content.put("title", title);
        }
        content.put("url", url);
        String description = Texts.blankToNull(fields.get("Description"));
        if (description != null) {
            content.put("description", description);
        }
        return content;
    }
}
