package com.dudu.duduserver.vo;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * 回复能力投影：沿用 Desk 现有 state/kinds 取值；空的可选字段省略。
 * 未接入渠道发送能力时如实返回 restricted 并说明原因，不编造可发能力。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record DeskCapabilityVO(String state, List<String> kinds, String reason) {
}
