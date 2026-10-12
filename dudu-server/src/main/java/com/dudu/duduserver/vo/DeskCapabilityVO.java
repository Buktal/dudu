package com.dudu.duduserver.vo;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * 回复能力投影：沿用 Desk 现有 state/kinds 取值；可发时 allowed + ["text"]，
 * 未配置凭据或不支持发送的渠道如实返回 restricted 并说明原因，不编造可发能力。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record DeskCapabilityVO(String state, List<String> kinds, String reason) {

    public static final String STATE_ALLOWED = "allowed";
    public static final String STATE_RESTRICTED = "restricted";
    public static final String KIND_TEXT = "text";

    public boolean allowed() {
        return STATE_ALLOWED.equals(state);
    }
}
