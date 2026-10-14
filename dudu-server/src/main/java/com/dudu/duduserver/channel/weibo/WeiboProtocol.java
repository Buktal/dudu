package com.dudu.duduserver.channel.weibo;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.support.Coordinates;
import com.dudu.duduserver.channel.support.Digests;
import com.dudu.duduserver.channel.support.MessageBodies;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.channel.support.Texts;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 微博回调协议（事实见 docs/research/channels/weibo.md §3.1、§4.1、§5）：验签密钥是
 * 开发者 App Secret 而非自定义 Token，appsecret/timestamp/nonce 字典序排序后拼接取 sha1
 * 十六进制小写与 signature 比对；推送报文为 JSON 明文（无加密层），普通消息按 type
 * 直接判型解析为契约第 4 节统一消息体，事件推送（type:"event"，被@ mention 例外同为
 * 事件侧）不产生访客消息，只由调用方应答。
 */
@Component
public class WeiboProtocol {

    // 普通消息 type 直接判型（§2.1）；位置是 position 不是 location
    private static final String MSG_TYPE_TEXT = "text";
    private static final String MSG_TYPE_POSITION = "position";
    private static final String MSG_TYPE_VOICE = "voice";
    private static final String MSG_TYPE_IMAGE = "image";

    // 事件推送判型（§2.2）：type:"event" 与被@的 mention 同为事件侧，只应答不落库
    private static final String MSG_TYPE_EVENT = "event";
    private static final String MSG_TYPE_MENTION = "mention";

    // 媒体文件标识取接收者侧 tovfid（msget 下载用），vfid 是发送者侧不落库
    private static final String DATA_TOVFID = "tovfid";

    /**
     * 三参验签：appsecret/timestamp/nonce 字典序排序后拼接取 sha1 与渠道签名比对；
     * 材料缺失按校验失败处理。
     */
    public boolean verify(String appSecret, String signature, String timestamp, String nonce) {
        if (isBlank(appSecret) || isBlank(signature) || isBlank(timestamp) || isBlank(nonce)) {
            return false;
        }
        String[] parts = {appSecret, timestamp, nonce};
        Arrays.sort(parts);
        return signature.equalsIgnoreCase(Digests.sha1Hex(String.join("", parts)));
    }

    /**
     * 解析推送报文：普通消息转为统一入站消息，事件推送返回空表示只应答不保存；报文无法
     * 解析或缺少发送方身份（sender_id）时抛出 {@link IllegalArgumentException}，由调用方
     * 按参数错误拒绝。微博无消息 ID（官方推荐 sender_id + created_at 排重），外部消息
     * 标识恒为空。
     */
    public Optional<ChannelInboundMessage> parse(Long companyChannelId, String body) {
        JSONObject payload;
        try {
            payload = JSONUtil.parseObj(body == null ? "" : body.stripLeading());
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("渠道回调报文无法解析", e);
        }
        String type = payload.getStr("type", "");
        String senderId = payload.getStr("sender_id", "");
        if (senderId.isEmpty()) {
            throw new IllegalArgumentException("渠道报文缺少发送方身份");
        }
        // 事件推送（follow/unfollow/subscribe/unsubscribe/scan/scan_follow/click/view）与
        // 被@的 mention 都不是访客消息：返回空表示只应答不保存
        if (MSG_TYPE_EVENT.equals(type) || MSG_TYPE_MENTION.equals(type)) {
            return Optional.empty();
        }
        return Optional.of(new ChannelInboundMessage(
            companyChannelId,
            senderId,
            null,
            null,
            List.of(),
            null,
            MessageDirectionEnum.INCOMING,
            content(type, payload)));
    }

    // 按 type 映射统一消息体；官方兼容性要求「出现未知类型时可忽略」，无法映射的按
    // unknown 如实保存不猜内容（字段值不符合类型约定时同样处理）
    private Map<String, Object> content(String type, JSONObject payload) {
        try {
            return switch (type) {
                case MSG_TYPE_TEXT -> Map.of("type", "text", "text", payload.getStr("text", ""));
                case MSG_TYPE_POSITION -> location(payload.getJSONObject("data"));
                case MSG_TYPE_VOICE -> media("audio", payload);
                case MSG_TYPE_IMAGE -> media("image", payload);
                default -> MessageBodies.unknown(type);
            };
        } catch (RuntimeException e) {
            return MessageBodies.unknown(type);
        }
    }

    // 位置私信 data:{longitude, latitude} 均为字符串，契约第 4 节统一为数值
    private Map<String, Object> location(JSONObject data) {
        return Map.of(
            "type", "location",
            "latitude", Coordinates.parse(data.getStr("latitude", "")),
            "longitude", Coordinates.parse(data.getStr("longitude", "")));
    }

    // 媒体引用必有 id：tovfid 缺失时没有可如实表达的引用，按 unknown 保存不填假值
    private Map<String, Object> media(String kind, JSONObject payload) {
        JSONObject data = payload.getJSONObject("data");
        String fileId = data == null ? null : Texts.blankToNull(data.getStr(DATA_TOVFID, ""));
        if (fileId == null) {
            return MessageBodies.unknown(payload.getStr("type", ""));
        }
        return Map.of("type", kind, "media", Map.of("kind", kind, "id", fileId));
    }

    private boolean isBlank(String value) {
        return value == null || value.isEmpty();
    }

    private String blankToNull(String value) {
        return isBlank(value) ? null : value;
    }
}

