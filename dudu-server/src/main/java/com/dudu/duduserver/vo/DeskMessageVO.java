package com.dudu.duduserver.vo;

import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.constant.MessageSendStatusEnum;
import com.dudu.duduserver.entity.MessageDO;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * Desk 消息投影（契约第 4 节 InboxMessage）：id 为消息 ID 字符串，body 原样承载统一消息体 JSON；
 * outgoing 增加发送员工、员工显示名与发送结果，其余方向的这些字段省略，不填假值。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record DeskMessageVO(
    String id,
    String conversationId,
    String clientRequestId,
    MessageDirectionEnum direction,
    Map<String, Object> body,
    LocalDateTime createdAt,
    Integer sequence,
    Integer version,
    String senderUserId,
    String senderName,
    Delivery delivery) {

    // 发送结果：state 沿用 sending/sent/failed，failed 时附实际原因
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Delivery(String state, String reason) {
    }

    // 映射契约第 4 节；senderName 由调用方按现有员工显示名查询后传入，不新增快照表
    public static DeskMessageVO of(MessageDO message, String senderName) {
        boolean outgoing = message.getDirection() == MessageDirectionEnum.OUTGOING;
        return new DeskMessageVO(
            String.valueOf(message.getMessageId()),
            String.valueOf(message.getVisitorId()),
            outgoing ? message.getClientRequestId() : null,
            message.getDirection(),
            message.getContent(),
            message.getCreateTime(),
            message.getSequence(),
            message.getVersion(),
            outgoing && message.getSenderUserId() != null ? String.valueOf(message.getSenderUserId()) : null,
            outgoing ? senderName : null,
            delivery(message, outgoing));
    }

    private static Delivery delivery(MessageDO message, boolean outgoing) {
        if (!outgoing || message.getSendStatus() == null) {
            return null;
        }
        return new Delivery(message.getSendStatus().getCode(),
            message.getSendStatus() == MessageSendStatusEnum.FAILED ? message.getFailureReason() : null);
    }
}
