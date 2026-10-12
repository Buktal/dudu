package com.dudu.duduserver.channel;

import com.dudu.duduserver.constant.MessageDirectionEnum;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 渠道入站消息：渠道回调适配器解析后的业务输入，与渠道原始报文形状解耦；
 * 名称、头像与资料项为可选，null 表示渠道未提供、不覆盖库中已有值；
 * content 为契约第 4 节统一消息体。
 */
public record ChannelInboundMessage(
    Long companyChannelId,
    String externalUserId,
    String name,
    String avatarUrl,
    List<ChannelField> channelFields,
    String externalMessageId,
    MessageDirectionEnum direction,
    Map<String, Object> content) {

    // 渠道资料项：value 为 null 表示渠道未提供，空串表示渠道给出空值，其余按有效值保存
    public record ChannelField(String label, String value) {
    }

    // 资料项取值状态，契约第 1 节 visitor_profile.channel_fields 结构
    private static final String STATE_AVAILABLE = "available";
    private static final String STATE_NOT_PROVIDED = "not-provided";
    private static final String STATE_EMPTY = "empty";

    /**
     * 合并渠道资料到现有数组：同名标签就地替换，新标签追加，其余顺序保持不变。
     */
    public static List<Map<String, Object>> mergeFields(List<Map<String, Object>> existing,
                                                        List<ChannelField> updates) {
        List<Map<String, Object>> merged = new ArrayList<>();
        if (existing != null) {
            for (Map<String, Object> field : existing) {
                merged.add(new LinkedHashMap<>(field));
            }
        }
        for (ChannelField update : updates) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("label", update.label());
            item.put("value", fieldValue(update.value()));
            int index = indexOfLabel(merged, update.label());
            if (index >= 0) {
                merged.set(index, item);
            } else {
                merged.add(item);
            }
        }
        return merged;
    }

    private static int indexOfLabel(List<Map<String, Object>> fields, String label) {
        for (int index = 0; index < fields.size(); index++) {
            if (label.equals(fields.get(index).get("label"))) {
                return index;
            }
        }
        return -1;
    }

    private static Map<String, Object> fieldValue(String value) {
        if (value == null) {
            return Map.of("state", STATE_NOT_PROVIDED);
        }
        if (value.isEmpty()) {
            return Map.of("state", STATE_EMPTY);
        }
        return Map.of("state", STATE_AVAILABLE, "value", value);
    }
}
