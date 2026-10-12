package com.dudu.duduserver.vo;

import com.dudu.duduserver.entity.VisitorProfileDO;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.Map;

/**
 * Desk 访客名片投影（契约第 4 节 VisitorProfile）：conversationId 即访客 ID，
 * fields 原样承载仅由入站管道维护的渠道资料数组，tags 与 note 为共享标签订单与备注；
 * 不重复身份字段（名称、头像、渠道与账号由会话对象给出）。HTTP 返回与 profile 推送共用本对象。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record DeskVisitorProfileVO(
    String conversationId,
    Integer version,
    List<Map<String, Object>> fields,
    List<String> tags,
    String note) {

    // 映射契约第 4 节：名片列直接对应，渠道资料不改形状
    public static DeskVisitorProfileVO of(VisitorProfileDO profile) {
        return new DeskVisitorProfileVO(
            String.valueOf(profile.getVisitorId()),
            profile.getVersion(),
            profile.getChannelFields(),
            profile.getTags(),
            profile.getNote());
    }
}
