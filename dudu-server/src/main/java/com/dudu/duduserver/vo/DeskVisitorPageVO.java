package com.dudu.duduserver.vo;

import java.util.List;

/**
 * Desk 访客查询结果：items/total 为本次筛选的当前页与总数，counts 为全部授权范围的
 * 四态统计（active = needsReply + waiting），channels 为授权账号用到的渠道代码与显示名。
 */
public record DeskVisitorPageVO(
    List<DeskConversationVO> items,
    Long total,
    Integer page,
    Integer pageSize,
    Counts counts,
    List<Channel> channels) {

    // 授权范围四态统计，不受本次筛选影响
    public record Counts(int active, int needsReply, int waiting, int closed) {
    }

    // 授权账号用到的渠道：id 为平台代码，name 为显示名
    public record Channel(String id, String name) {
    }
}
