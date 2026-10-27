package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.dudu.duduserver.channel.douyin.DouyinReplyContext;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.entity.MessageDO;
import com.dudu.duduserver.entity.VisitorDO;
import com.dudu.duduserver.service.MessageService;
import com.dudu.duduserver.service.VisitorService;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 抖音回复上下文的生产实现：从既有 visitor/message 表回看访客最近若干封来信，取第一份
 * 能解出三段复合渠道消息标识（server_message_id:conversation_short_id:发送方 open_id，
 * 见 docs/research/channels/douyin.md §6.1）的来信作为回复上下文。最新来信可能是退化
 * 形态（旧数据只有裸 server_message_id），不阻塞窗口内更早的完整上下文。业务侧实现
 * （ADR-0014：业务表访问不进 channel 包），接口 {@link DouyinReplyContext} 留在渠道
 * seam 由发送器注入。只读查询，不新增表与列。
 */
@Component
public class DouyinReplyContextFinder implements DouyinReplyContext {

    // 复合标识分隔符：三值（base64 会话/消息标识、uuid 风格 open_id）均不含冒号
    private static final String CONTEXT_SEPARATOR = ":";

    // 回看窗口：最新一封退化时窗口内更早的完整上下文仍在渠道时效内可回复；
    // 24 小时时效由渠道校验，不本地预判
    private static final String RECENT_INCOMING_ROWS = "LIMIT 20";

    private final VisitorService visitorService;

    private final MessageService messageService;

    public DouyinReplyContextFinder(VisitorService visitorService, MessageService messageService) {
        this.visitorService = visitorService;
        this.messageService = messageService;
    }

    @Override
    public Reply lookup(Long companyChannelId, String externalUserId) {
        VisitorDO visitor = visitorService.getOne(Wrappers.<VisitorDO>lambdaQuery()
            .eq(VisitorDO::getCompanyChannelId, companyChannelId)
            .eq(VisitorDO::getExternalUserId, externalUserId));
        if (visitor == null) {
            return null;
        }
        List<MessageDO> recent = messageService.list(Wrappers.<MessageDO>lambdaQuery()
            .eq(MessageDO::getVisitorId, visitor.getVisitorId())
            .eq(MessageDO::getDirection, MessageDirectionEnum.INCOMING)
            .orderByDesc(MessageDO::getSequence)
            .last(RECENT_INCOMING_ROWS));
        // 按来信新到旧回看：第一份能解出三段复合标识的即为回复上下文
        for (MessageDO message : recent) {
            Reply reply = parse(message.getExternalMessageId());
            if (reply != null) {
                return reply;
            }
        }
        return null;
    }

    // 三段齐全才构成可回复上下文；其余形态（裸 server_message_id 等）按缺失处理
    private Reply parse(String composite) {
        if (composite == null) {
            return null;
        }
        String[] parts = composite.split(CONTEXT_SEPARATOR, 3);
        if (parts.length != 3) {
            return null;
        }
        return new Reply(parts[0], parts[1], parts[2]);
    }
}
