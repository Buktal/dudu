package com.dudu.duduserver.util;

import com.dudu.duduserver.channel.ChannelAdapterRegistry;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.constant.VisitorStatusEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.entity.VisitorDO;
import com.dudu.duduserver.vo.DeskCapabilityVO;
import com.dudu.duduserver.vo.DeskConversationVO;
import com.dudu.duduserver.vo.DeskVisitorIdentityVO;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 会话对象装配：查询响应、能力接口与消息推送共用同一份契约第 4 节映射，
 * updatedAt 取最后消息时间（无消息回落创建时间），waitingSince 只在待回复时返回，
 * capability 来自注册表分派的当前账号真实渠道接入方式（不返回凭据本身）。
 */
@Component
public class DeskConversationViews {

    private final ChannelAdapterRegistry channelAdapters;

    public DeskConversationViews(ChannelAdapterRegistry channelAdapters) {
        this.channelAdapters = channelAdapters;
    }

    public DeskConversationVO conversation(VisitorDO visitor, CompanyChannelDO account) {
        ChannelEnum channel = account == null ? null : account.getChannel();
        DeskVisitorIdentityVO identity = new DeskVisitorIdentityVO(
            String.valueOf(visitor.getVisitorId()),
            visitor.getExternalUserId(),
            visitor.getName(),
            visitor.getAvatarUrl(),
            channel == null ? null : channel.getCode(),
            channel == null ? null : channel.getDisplayName(),
            account == null ? null : String.valueOf(account.getCompanyChannelId()),
            account == null ? null : account.getAccountName());
        return new DeskConversationVO(
            String.valueOf(visitor.getVisitorId()),
            identity,
            visitor.getStatus(),
            visitor.getLastMessagePreview(),
            visitor.getLastMessageTime() == null ? visitor.getCreateTime() : visitor.getLastMessageTime(),
            visitor.getStatus() == VisitorStatusEnum.NEEDS_REPLY ? visitor.getWaitingSince() : null,
            visitor.getMessageCount(),
            visitor.getVersion(),
            capability(account));
    }

    // 可发时 allowed + ["text"]；账号缺失、渠道未接入或缺少凭据时 restricted 并说明原因
    public DeskCapabilityVO capability(CompanyChannelDO account) {
        String restriction = channelAdapters.sendRestriction(account);
        return restriction == null
            ? new DeskCapabilityVO(DeskCapabilityVO.STATE_ALLOWED, List.of(DeskCapabilityVO.KIND_TEXT), null)
            : new DeskCapabilityVO(DeskCapabilityVO.STATE_RESTRICTED, List.of(), restriction);
    }
}
