package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.dudu.duduserver.channel.ChannelAdapterRegistry;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.constant.MessageSendStatusEnum;
import com.dudu.duduserver.constant.VisitorStatusEnum;
import com.dudu.duduserver.dto.DeskSendDTO;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.entity.MessageDO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.entity.VisitorDO;
import com.dudu.duduserver.service.CompanyChannelService;
import com.dudu.duduserver.service.DeskReplyService;
import com.dudu.duduserver.service.DeskVisitorService;
import com.dudu.duduserver.service.MessageService;
import com.dudu.duduserver.service.UserService;
import com.dudu.duduserver.service.VisitorService;
import com.dudu.duduserver.socket.DeskSocketGateway;
import com.dudu.duduserver.util.DeskConversationViews;
import com.dudu.duduserver.util.DeskMessagePreview;
import com.dudu.duduserver.vo.DeskCapabilityVO;
import com.dudu.duduserver.vo.DeskConversationVO;
import com.dudu.duduserver.vo.DeskMessageVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 文本回复实现：权限与访客存在性复用访客守卫（10106/12100），发送端再校验一次渠道能力
 * （12200）。发送分两次事务：先提交 outgoing/sending 与最后消息/计数（此时不改接待状态、
 * 不推送），再在事务外调用渠道，最后提交 sent/failed、按规则更新接待状态，并推送一次
 * message 报文。渠道调用不放在数据库事务里，调用未返回时记录保持 sending；不设计重试
 * 协议与后台投递队列，手动重发由客户端用新 clientRequestId 再次调用本接口。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DeskReplyServiceImpl implements DeskReplyService {

    // 契约第 3 节：正文必须含非空白字符且最多 4000 字，clientRequestId 为 1–64 字符
    private static final int TEXT_MAX_LENGTH = 4000;
    private static final int CLIENT_REQUEST_ID_MAX_LENGTH = 64;
    // message.failure_reason 列宽
    private static final int FAILURE_REASON_MAX_LENGTH = 500;
    private static final String CONTENT_TYPE_TEXT = "text";
    private static final String REASON_UNKNOWN = "渠道发送失败";

    private final DeskVisitorService deskVisitorService;
    private final VisitorService visitorService;
    private final MessageService messageService;
    private final CompanyChannelService companyChannelService;
    private final UserService userService;
    private final ChannelAdapterRegistry channelAdapters;
    private final DeskConversationViews deskConversationViews;
    private final DeskSocketGateway deskSocketGateway;
    private final TransactionTemplate transactionTemplate;

    @Override
    public DeskCapabilityVO capability(JwtUser me, String visitorId) {
        return deskVisitorService.get(me, visitorId).capability();
    }

    @Override
    public DeskMessageVO send(JwtUser me, String visitorId, DeskSendDTO request) {
        String clientRequestId = requireClientRequestId(request.clientRequestId());
        String text = requireText(request.text());
        // 访客守卫同时给出授权范围与当前能力；能力不可发时不再落库、不调用渠道
        DeskConversationVO conversation = deskVisitorService.get(me, visitorId);
        DeskCapabilityVO capability = conversation.capability();
        if (!capability.allowed()) {
            throw new BizException(ApiEnum.DATA_NOT_ALLOW, capability.reason());
        }
        // 发送目标按访客归属读取，不信任客户端提交的渠道账号与外部身份
        VisitorDO visitor = visitorService.getById(Long.valueOf(conversation.id()));
        CompanyChannelDO account = companyChannelService.getById(visitor.getCompanyChannelId());

        MessageDO message = transactionTemplate.execute(
            status -> beginSend(visitor, me, clientRequestId, text));
        ChannelSendResult result = sendToChannel(account, visitor.getExternalUserId(), text);
        SendOutcome outcome = transactionTemplate.execute(
            status -> completeSend(message.getMessageId(), result));
        pushOutcome(outcome);
        return outcome.message();
    }

    // 提交发送中记录：message_count 与 version 单条 UPDATE 原子递增后回读分配 sequence（同入站规则），
    // 最后消息与摘要按入库顺序更新；此时按契约不改接待状态、不推送
    private MessageDO beginSend(VisitorDO visitor, JwtUser me, String clientRequestId, String text) {
        LocalDateTime now = LocalDateTime.now();
        visitorService.update(Wrappers.<VisitorDO>lambdaUpdate()
            .eq(VisitorDO::getVisitorId, visitor.getVisitorId())
            .setSql("message_count = message_count + 1")
            .setSql("version = version + 1")
            .set(VisitorDO::getUpdateTime, now));
        Integer sequence = visitorService.getById(visitor.getVisitorId()).getMessageCount();

        MessageDO message = new MessageDO();
        message.setVisitorId(visitor.getVisitorId());
        message.setSequence(sequence);
        message.setDirection(MessageDirectionEnum.OUTGOING);
        message.setSenderUserId(me.userId());
        message.setClientRequestId(clientRequestId);
        message.setContent(Map.of("type", CONTENT_TYPE_TEXT, "text", text));
        message.setSendStatus(MessageSendStatusEnum.SENDING);
        message.setVersion(1);
        messageService.save(message);

        visitorService.update(Wrappers.<VisitorDO>lambdaUpdate()
            .eq(VisitorDO::getVisitorId, visitor.getVisitorId())
            .set(VisitorDO::getLastMessageId, message.getMessageId())
            .set(VisitorDO::getLastMessagePreview, DeskMessagePreview.of(message.getContent()))
            .set(VisitorDO::getLastMessageTime, message.getCreateTime())
            .set(VisitorDO::getUpdateTime, now));
        return message;
    }

    // 提交发送结果：结果改变不新增消息、不再增加计数；只有成功且未结束、其后没有更新的
    // incoming 时才改 waiting 并清空 waiting_since，失败不把咨询算作已回复
    private SendOutcome completeSend(Long messageId, ChannelSendResult result) {
        LocalDateTime now = LocalDateTime.now();
        boolean succeeded = result.succeeded();
        messageService.update(Wrappers.<MessageDO>lambdaUpdate()
            .eq(MessageDO::getMessageId, messageId)
            .set(MessageDO::getSendStatus,
                succeeded ? MessageSendStatusEnum.SENT : MessageSendStatusEnum.FAILED)
            .set(succeeded && result.externalMessageId() != null,
                MessageDO::getExternalMessageId, result.externalMessageId())
            .set(!succeeded, MessageDO::getFailureReason, failureReason(result.failureReason()))
            .setSql("version = version + 1")
            .set(MessageDO::getUpdateTime, now));
        MessageDO message = messageService.getById(messageId);
        VisitorDO visitor = visitorService.getById(message.getVisitorId());

        if (succeeded && visitor.awaitingReply() && !hasNewerIncoming(message)) {
            visitorService.update(Wrappers.<VisitorDO>lambdaUpdate()
                .eq(VisitorDO::getVisitorId, visitor.getVisitorId())
                .set(VisitorDO::getStatus, VisitorStatusEnum.WAITING)
                .setSql("waiting_since = NULL")
                .setSql("version = version + 1")
                .set(VisitorDO::getUpdateTime, now));
            visitor = visitorService.getById(visitor.getVisitorId());
        }

        CompanyChannelDO account = companyChannelService.getById(visitor.getCompanyChannelId());
        UserDO sender = userService.getById(message.getSenderUserId());
        return new SendOutcome(
            DeskMessageVO.of(message, sender == null ? null : sender.getName()),
            deskConversationViews.conversation(visitor, account),
            account == null ? null : account.getCompanyId(),
            account == null ? null : account.getCompanyChannelId());
    }

    // 直接查询本会话消息判断回复基线，不新增基线表：该 outgoing 之后还有更新的来信时保留当前状态
    private boolean hasNewerIncoming(MessageDO message) {
        return messageService.count(Wrappers.<MessageDO>lambdaQuery()
            .eq(MessageDO::getVisitorId, message.getVisitorId())
            .eq(MessageDO::getDirection, MessageDirectionEnum.INCOMING)
            .gt(MessageDO::getSequence, message.getSequence())) > 0;
    }

    // 渠道边界负责翻译渠道协议；异常也按真实原因记录为失败，不猜测发送结果
    private ChannelSendResult sendToChannel(CompanyChannelDO account, String externalUserId, String text) {
        try {
            return channelAdapters.send(account, externalUserId, text);
        } catch (RuntimeException e) {
            log.error("[desk-reply] 渠道发送异常, companyChannelId={}",
                account == null ? null : account.getCompanyChannelId(), e);
            String reason = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            return ChannelSendResult.failed("渠道发送异常：" + reason);
        }
    }

    // 结果保存后发送一次 message 报文（完整消息与最新访客摘要，含发送者本人）；推送失败只记录
    private void pushOutcome(SendOutcome outcome) {
        if (outcome.companyId() == null || outcome.companyChannelId() == null) {
            return;
        }
        try {
            deskSocketGateway.pushMessage(outcome.companyId(), outcome.companyChannelId(),
                outcome.message(), outcome.conversation());
        } catch (RuntimeException e) {
            log.error("[desk-reply] 推送发送结果失败, messageId={}, visitorId={}",
                outcome.message().id(), outcome.conversation().id(), e);
        }
    }

    // clientRequestId 1–64 字符：缺失 11100，空白 11000，超长 11200
    private String requireClientRequestId(String clientRequestId) {
        if (clientRequestId == null) {
            throw new BizException(ApiEnum.PARAM_MISSING, "缺少本地请求标识");
        }
        if (!StringUtils.hasText(clientRequestId)) {
            throw new BizException(ApiEnum.PARAM_ERROR, "本地请求标识不能为空白");
        }
        if (clientRequestId.length() > CLIENT_REQUEST_ID_MAX_LENGTH) {
            throw new BizException(ApiEnum.PARAM_EXCEED,
                "本地请求标识不能超过 " + CLIENT_REQUEST_ID_MAX_LENGTH + " 字符");
        }
        return clientRequestId;
    }

    // 正文必须含非空白字符且最多 4000 字；返回原值，保留实际文字与换行
    private String requireText(String text) {
        if (text == null) {
            throw new BizException(ApiEnum.PARAM_MISSING, "缺少回复内容");
        }
        if (text.isBlank()) {
            throw new BizException(ApiEnum.PARAM_ERROR, "回复内容不能为空");
        }
        if (text.length() > TEXT_MAX_LENGTH) {
            throw new BizException(ApiEnum.PARAM_EXCEED, "回复内容不能超过 " + TEXT_MAX_LENGTH + " 字");
        }
        return text;
    }

    // 失败原因记录渠道给出的真实说明，超长按列宽截断
    private String failureReason(String reason) {
        String value = StringUtils.hasText(reason) ? reason : REASON_UNKNOWN;
        return value.length() > FAILURE_REASON_MAX_LENGTH
            ? value.substring(0, FAILURE_REASON_MAX_LENGTH)
            : value;
    }

    // 结果落库后的对外投影：HTTP 返回与 Socket 推送共用同一条最终消息
    private record SendOutcome(DeskMessageVO message, DeskConversationVO conversation,
                               Long companyId, Long companyChannelId) {
    }
}
