package com.dudu.duduserver.util;

import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.constant.VisitorStatusEnum;
import com.dudu.duduserver.entity.VisitorDO;
import com.dudu.duduserver.vo.DeskCapabilityVO;
import com.dudu.duduserver.vo.DeskConversationVO;
import com.dudu.duduserver.vo.DeskVisitorIdentityVO;

import java.util.List;

/**
 * 会话对象装配：查询响应与入站推送共用同一份契约第 4 节映射，
 * updatedAt 取最后消息时间（无消息回落创建时间），waitingSince 只在待回复时返回。
 */
public final class DeskConversationViews {

    // 渠道发送能力由后续消息票接通；当前如实返回不可发送与原因，不编造可发能力
    public static final DeskCapabilityVO NOT_READY_CAPABILITY =
        new DeskCapabilityVO("restricted", List.of(), "渠道发送能力尚未接入");

    private DeskConversationViews() {
    }

    public static DeskConversationVO conversation(VisitorDO visitor, ChannelEnum channel,
                                                  String accountId, String accountName) {
        DeskVisitorIdentityVO identity = new DeskVisitorIdentityVO(
            String.valueOf(visitor.getVisitorId()),
            visitor.getExternalUserId(),
            visitor.getName(),
            visitor.getAvatarUrl(),
            channel == null ? null : channel.getCode(),
            channel == null ? null : channel.getDisplayName(),
            accountId,
            accountName);
        return new DeskConversationVO(
            String.valueOf(visitor.getVisitorId()),
            identity,
            visitor.getStatus(),
            visitor.getLastMessagePreview(),
            visitor.getLastMessageTime() == null ? visitor.getCreateTime() : visitor.getLastMessageTime(),
            visitor.getStatus() == VisitorStatusEnum.NEEDS_REPLY ? visitor.getWaitingSince() : null,
            visitor.getMessageCount(),
            visitor.getVersion(),
            NOT_READY_CAPABILITY);
    }
}
