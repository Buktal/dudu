package com.dudu.duduserver.vo;

import com.dudu.duduserver.constant.VisitorStatusEnum;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.LocalDateTime;

/**
 * Desk 会话对象：访客 ID 即会话 ID；updatedAt 取最后消息时间，从未有消息时为创建时间；
 * waitingSince 只在待回复时返回；业务 ID 为十进制字符串，计数与版本为普通整数。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record DeskConversationVO(
    String id,
    DeskVisitorIdentityVO identity,
    VisitorStatusEnum status,
    String preview,
    LocalDateTime updatedAt,
    LocalDateTime waitingSince,
    Integer messageCount,
    Integer version,
    DeskCapabilityVO capability) {
}
