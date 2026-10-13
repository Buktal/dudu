package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.constant.VisitorStatusEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.entity.MessageDO;
import com.dudu.duduserver.entity.VisitorDO;
import com.dudu.duduserver.entity.VisitorProfileDO;
import com.dudu.duduserver.service.DeskInboundService;
import com.dudu.duduserver.service.MessageService;
import com.dudu.duduserver.service.VisitorProfileService;
import com.dudu.duduserver.service.VisitorService;
import com.dudu.duduserver.socket.DeskSocketGateway;
import com.dudu.duduserver.util.DeskConversationViews;
import com.dudu.duduserver.util.DeskMessagePreview;
import com.dudu.duduserver.vo.DeskConversationVO;
import com.dudu.duduserver.vo.DeskMessageVO;
import com.dudu.duduserver.vo.DeskVisitorProfileVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 入站信件实现：来源唯一键 (company_id, company_channel_id, external_user_id) 找到或创建访客，
 * 同事务创建空名片；message_count 用单条 UPDATE 原子递增并回读分配 sequence，随后写入消息与
 * 最后消息/接待状态。渠道资料按未提供、空值与有效值区分更新，推送在事务提交后发出且失败不影响落库。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DeskInboundServiceImpl implements DeskInboundService {

    // 并发首信撞唯一键后回读用的行锁片段：锁定读绕过可重复读快照，取另一事务已提交的行
    private static final String LOCK_ROW = "FOR UPDATE";

    private final VisitorService visitorService;
    private final VisitorProfileService visitorProfileService;
    private final MessageService messageService;
    private final DeskSocketGateway deskSocketGateway;
    private final DeskConversationViews deskConversationViews;

    @Override
    @Transactional
    public void accept(CompanyChannelDO account, ChannelInboundMessage inbound) {
        LocalDateTime now = LocalDateTime.now();
        VisitorDO visitor = findVisitor(account, inbound.externalUserId());
        if (visitor == null) {
            visitor = createVisitor(account, inbound, now);
        }
        // 渠道资料有变化的名片随来信一起在提交后推送；没有变化时为空
        VisitorProfileDO profileChange = applyChannelProfile(visitor, inbound, now);
        // message_count 与 version 单条 UPDATE 原子递增，行锁下并发来信依次排队
        visitorService.update(Wrappers.<VisitorDO>lambdaUpdate()
            .eq(VisitorDO::getVisitorId, visitor.getVisitorId())
            .setSql("message_count = message_count + 1")
            .setSql("version = version + 1")
            .set(VisitorDO::getUpdateTime, now));
        Integer sequence = visitorService.getById(visitor.getVisitorId()).getMessageCount();
        MessageDO message = saveMessage(visitor.getVisitorId(), sequence, inbound);
        // 最后消息与接待状态同事务落库；已待回复保留本轮 waiting_since，否则重新计时
        visitorService.update(Wrappers.<VisitorDO>lambdaUpdate()
            .eq(VisitorDO::getVisitorId, visitor.getVisitorId())
            .set(VisitorDO::getLastMessageId, message.getMessageId())
            .set(VisitorDO::getLastMessagePreview, DeskMessagePreview.of(inbound.content()))
            .set(VisitorDO::getLastMessageTime, message.getCreateTime())
            .set(VisitorDO::getStatus, VisitorStatusEnum.NEEDS_REPLY)
            .set(!visitor.awaitingReply(), VisitorDO::getWaitingSince, now)
            .set(VisitorDO::getUpdateTime, now));
        pushAfterCommit(account, visitorService.getById(visitor.getVisitorId()), message, profileChange);
    }

    // 渠道资料名称与头像为可选：null 表示未提供、保留原值，空串与有效值按渠道给出的内容保存；
    // 返回确实变化的渠道资料名片（供 profile 推送），没有变化返回 null
    private VisitorProfileDO applyChannelProfile(VisitorDO visitor, ChannelInboundMessage inbound, LocalDateTime now) {
        boolean nameChanged = inbound.name() != null && !inbound.name().equals(visitor.getName());
        boolean avatarChanged = inbound.avatarUrl() != null && !inbound.avatarUrl().equals(visitor.getAvatarUrl());
        if (nameChanged || avatarChanged) {
            visitorService.update(Wrappers.<VisitorDO>lambdaUpdate()
                .eq(VisitorDO::getVisitorId, visitor.getVisitorId())
                .set(nameChanged, VisitorDO::getName, inbound.name())
                .set(avatarChanged, VisitorDO::getAvatarUrl, inbound.avatarUrl())
                .set(VisitorDO::getUpdateTime, now));
        }
        if (inbound.channelFields().isEmpty()) {
            return null;
        }
        VisitorProfileDO profile = visitorProfileService.getById(visitor.getVisitorId());
        if (profile == null) {
            return null;
        }
        List<Map<String, Object>> merged = ChannelInboundMessage.mergeFields(
            profile.getChannelFields(), inbound.channelFields());
        if (merged.equals(profile.getChannelFields())) {
            // 渠道资料逐项一致：没有实际变化，不写库也不推送
            return null;
        }
        // 资料按标签就地合并；JSON 列经实体类型处理器写入，避免更新包装器绕过 typeHandler
        VisitorProfileDO patch = new VisitorProfileDO();
        patch.setVisitorId(visitor.getVisitorId());
        patch.setChannelFields(merged);
        patch.setVersion(profile.getVersion() + 1);
        visitorProfileService.updateById(patch);
        // 推送用的名片带上共享标签与备注，与 profile 接口返回形状一致
        patch.setTags(profile.getTags());
        patch.setNote(profile.getNote());
        return patch;
    }

    private VisitorDO findVisitor(CompanyChannelDO account, String externalUserId) {
        return visitorService.getOne(sourceOf(account, externalUserId));
    }

    // 首信并发：唯一键冲突说明另一事务已创建访客，锁定读回读该行继续本条消息
    private VisitorDO createVisitor(CompanyChannelDO account, ChannelInboundMessage inbound, LocalDateTime now) {
        VisitorDO visitor = new VisitorDO();
        visitor.setCompanyId(account.getCompanyId());
        visitor.setCompanyChannelId(account.getCompanyChannelId());
        visitor.setExternalUserId(inbound.externalUserId());
        visitor.setName(inbound.name());
        visitor.setAvatarUrl(inbound.avatarUrl());
        visitor.setStatus(VisitorStatusEnum.NEEDS_REPLY);
        visitor.setLastMessagePreview("");
        visitor.setWaitingSince(now);
        visitor.setMessageCount(0);
        visitor.setVersion(1);
        try {
            visitorService.save(visitor);
        } catch (DuplicateKeyException e) {
            return visitorService.getOne(sourceOf(account, inbound.externalUserId()).last(LOCK_ROW));
        }
        VisitorProfileDO profile = new VisitorProfileDO();
        profile.setVisitorId(visitor.getVisitorId());
        profile.setChannelFields(List.of());
        profile.setTags(List.of());
        profile.setNote("");
        profile.setVersion(1);
        visitorProfileService.save(profile);
        return visitor;
    }

    private MessageDO saveMessage(Long visitorId, Integer sequence, ChannelInboundMessage inbound) {
        MessageDO message = new MessageDO();
        message.setVisitorId(visitorId);
        message.setSequence(sequence);
        message.setDirection(inbound.direction());
        message.setExternalMessageId(inbound.externalMessageId());
        message.setContent(inbound.content());
        message.setVersion(1);
        messageService.save(message);
        return message;
    }

    private LambdaQueryWrapper<VisitorDO> sourceOf(CompanyChannelDO account, String externalUserId) {
        return Wrappers.<VisitorDO>lambdaQuery()
            .eq(VisitorDO::getCompanyId, account.getCompanyId())
            .eq(VisitorDO::getCompanyChannelId, account.getCompanyChannelId())
            .eq(VisitorDO::getExternalUserId, externalUserId);
    }

    // 事务提交后再推送：读到的摘要与查询接口一致；渠道资料有变化时追加一次 profile 推送（不另发 conversation）；
    // 推送失败只记录，不回滚已保存的来信
    private void pushAfterCommit(CompanyChannelDO account, VisitorDO visitor, MessageDO message,
                                 VisitorProfileDO profileChange) {
        DeskConversationVO conversation = deskConversationViews.conversation(visitor, account);
        DeskMessageVO messageVO = DeskMessageVO.of(message, null);
        DeskVisitorProfileVO profileVO = profileChange == null ? null : DeskVisitorProfileVO.of(profileChange);
        Long companyId = account.getCompanyId();
        Long companyChannelId = account.getCompanyChannelId();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    notifyAuthorized(companyId, companyChannelId, messageVO, conversation, profileVO);
                }
            });
            return;
        }
        notifyAuthorized(companyId, companyChannelId, messageVO, conversation, profileVO);
    }

    private void notifyAuthorized(Long companyId, Long companyChannelId, DeskMessageVO message,
                                  DeskConversationVO conversation, DeskVisitorProfileVO profile) {
        try {
            deskSocketGateway.pushMessage(companyId, companyChannelId, message, conversation);
        } catch (RuntimeException e) {
            log.error("[desk-inbound] 推送来信失败, messageId={}, visitorId={}",
                message.id(), conversation.id(), e);
        }
        if (profile == null) {
            return;
        }
        try {
            deskSocketGateway.pushProfile(companyId, companyChannelId, profile);
        } catch (RuntimeException e) {
            log.error("[desk-inbound] 推送渠道资料失败, visitorId={}", profile.conversationId(), e);
        }
    }
}
