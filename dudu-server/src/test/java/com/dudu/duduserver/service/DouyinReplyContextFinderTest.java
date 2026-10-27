package com.dudu.duduserver.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.dudu.duduserver.channel.douyin.DouyinReplyContext;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.entity.MessageDO;
import com.dudu.duduserver.entity.VisitorDO;
import com.dudu.duduserver.service.impl.DouyinReplyContextFinder;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 抖音回复上下文查找单元验证：按来信新到旧回看，取第一份能解出三段复合标识的来信；
 * 最新退化形态（裸 server_message_id）不阻塞更早的完整上下文，窗口内全部不可解析或
 * 无来信按缺失处理，由发送侧如实失败。
 */
class DouyinReplyContextFinderTest {

    private static final Long COMPANY_CHANNEL_ID = 77101L;
    private static final Long VISITOR_ID = 77102L;

    private final VisitorService visitorService = mock(VisitorService.class);
    private final MessageService messageService = mock(MessageService.class);
    private final DouyinReplyContextFinder finder = new DouyinReplyContextFinder(visitorService, messageService);

    @BeforeAll
    static void registerTableInfo() {
        // 服务内的 LambdaQueryWrapper 需要实体 TableInfo 缓存，无 DB 环境下手动注册
        TableInfoHelper.initTableInfo(
            new MapperBuilderAssistant(new MybatisConfiguration(), ""), VisitorDO.class);
        TableInfoHelper.initTableInfo(
            new MapperBuilderAssistant(new MybatisConfiguration(), ""), MessageDO.class);
    }

    @BeforeEach
    void stubExistingVisitor() {
        VisitorDO visitor = new VisitorDO();
        visitor.setVisitorId(VISITOR_ID);
        visitor.setCompanyChannelId(COMPANY_CHANNEL_ID);
        visitor.setExternalUserId("visitor-open");
        when(visitorService.getOne(any(Wrapper.class))).thenReturn(visitor);
    }

    @Test
    void latestCompleteContextIsUsedDirectly() {
        when(messageService.list(any(Wrapper.class))).thenReturn(List.of(
            complete("@msg-9", 9)));

        DouyinReplyContext.Reply reply = finder.lookup(COMPANY_CHANNEL_ID, "visitor-open");

        assertThat(reply).isEqualTo(new DouyinReplyContext.Reply("@msg-9", "@conv-9", "owner-open"));
    }

    @Test
    void olderCompleteContextIsUsedWhenLatestIsDegraded() {
        // 最新一封为旧数据裸 server_message_id：回看取次新完整上下文
        when(messageService.list(any(Wrapper.class))).thenReturn(List.of(
            degraded(9),
            complete("@msg-8", 8)));

        DouyinReplyContext.Reply reply = finder.lookup(COMPANY_CHANNEL_ID, "visitor-open");

        assertThat(reply).isEqualTo(new DouyinReplyContext.Reply("@msg-8", "@conv-8", "owner-open"));
    }

    @Test
    void returnsNullWhenEveryRecentIncomingIsDegraded() {
        when(messageService.list(any(Wrapper.class))).thenReturn(List.of(
            degraded(9),
            degraded(8),
            degraded(7)));

        assertThat(finder.lookup(COMPANY_CHANNEL_ID, "visitor-open")).isNull();
    }

    @Test
    void returnsNullWhenVisitorHasNoIncomingMessage() {
        when(messageService.list(any(Wrapper.class))).thenReturn(List.of());

        assertThat(finder.lookup(COMPANY_CHANNEL_ID, "visitor-open")).isNull();
    }

    @Test
    void returnsNullWhenVisitorDoesNotExist() {
        when(visitorService.getOne(any(Wrapper.class))).thenReturn(null);

        assertThat(finder.lookup(COMPANY_CHANNEL_ID, "visitor-open")).isNull();
    }

    // 复合标识完整的来信（入站留存 server_message_id:conversation_short_id:发送方 open_id）
    private MessageDO complete(String serverMessageId, int sequence) {
        MessageDO message = new MessageDO();
        message.setVisitorId(VISITOR_ID);
        message.setSequence(sequence);
        message.setDirection(MessageDirectionEnum.INCOMING);
        message.setExternalMessageId(serverMessageId + ":@conv-" + sequence + ":owner-open");
        return message;
    }

    // 退化形态来信：外部标识只有裸 server_message_id（旧数据），解不出会话与发送方
    private MessageDO degraded(int sequence) {
        MessageDO message = new MessageDO();
        message.setVisitorId(VISITOR_ID);
        message.setSequence(sequence);
        message.setDirection(MessageDirectionEnum.INCOMING);
        message.setExternalMessageId("@bare-msg-" + sequence);
        return message;
    }
}
