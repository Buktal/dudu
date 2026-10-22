package com.dudu.duduserver.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.ChannelAdapterRegistry;
import com.dudu.duduserver.channel.wechatmp.WechatMpAdapter;
import com.dudu.duduserver.channel.wechatmp.WechatMpMediaReader;
import com.dudu.duduserver.channel.wechatmp.WechatMpProtocol;
import com.dudu.duduserver.channel.wechatmp.WechatMpTextSender;
import com.dudu.duduserver.service.impl.DeskConversationViews;
import com.dudu.duduserver.service.impl.PushGate;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.constant.VisitorStatusEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.entity.MessageDO;
import com.dudu.duduserver.entity.VisitorDO;
import com.dudu.duduserver.entity.VisitorProfileDO;
import com.dudu.duduserver.service.impl.DeskInboundServiceImpl;
import com.dudu.duduserver.socket.DeskSocketGateway;
import com.dudu.duduserver.vo.DeskVisitorProfileVO;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.web.client.RestClient;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 入站信件服务单元验证：渠道资料有变化时随来信追加 profile 推送，无变化时不推送；
 * 真实事务提交与推送帧形状由独立 MySQL 验收与网关测试覆盖。
 */
class DeskInboundServiceTest {

    private static final Long COMPANY_ID = 785101L;
    private static final Long COMPANY_CHANNEL_ID = 785102L;
    private static final Long VISITOR_ID = 785103L;

    private final VisitorService visitorService = mock(VisitorService.class);
    private final VisitorProfileService visitorProfileService = mock(VisitorProfileService.class);
    private final MessageService messageService = mock(MessageService.class);
    private final DeskSocketGateway deskSocketGateway = mock(DeskSocketGateway.class);
    private final DeskInboundService deskInboundService = new DeskInboundServiceImpl(
        visitorService, visitorProfileService, messageService, deskSocketGateway, new PushGate(),
        deskConversationViews());
    // 能力说明走真实注册表与公众号适配器；本类只用其限制说明，不发起渠道请求
    private static DeskConversationViews deskConversationViews() {
        WechatMpAdapter wechatMp = new WechatMpAdapter(new WechatMpProtocol(),
            new WechatMpTextSender(RestClient.builder(), "http://127.0.0.1:9"),
            new WechatMpMediaReader(RestClient.builder(), "http://127.0.0.1:9"));
        return new DeskConversationViews(new ChannelAdapterRegistry(List.of(wechatMp)));
    }


    @BeforeAll
    static void registerTableInfo() {
        // 服务内的 LambdaQueryWrapper 需要实体 TableInfo 缓存，无 DB 环境下手动注册
        TableInfoHelper.initTableInfo(
            new MapperBuilderAssistant(new MybatisConfiguration(), ""), VisitorDO.class);
    }

    @BeforeEach
    void stubExistingVisitor() {
        VisitorDO visitor = visitor(VisitorStatusEnum.WAITING, null);
        when(visitorService.getOne(any(Wrapper.class))).thenReturn(visitor);
        when(visitorService.getById(VISITOR_ID)).thenReturn(visitor(VisitorStatusEnum.WAITING, null));
        when(visitorService.update(any(Wrapper.class))).thenReturn(true);
    }

    @Test
    void pushesProfileFrameWhenInboundChannelFieldsChange() {
        when(visitorProfileService.getById(VISITOR_ID))
            .thenReturn(profile(List.of(Map.of("label", "城市", "value", Map.of("state", "empty"))), 3));

        deskInboundService.accept(account(), inbound(List.of(new ChannelInboundMessage.ChannelField("城市", "广州"))));

        ArgumentCaptor<DeskVisitorProfileVO> pushed = ArgumentCaptor.forClass(DeskVisitorProfileVO.class);
        verify(deskSocketGateway).pushProfile(eq(COMPANY_ID), eq(COMPANY_CHANNEL_ID), pushed.capture());
        assertThat(pushed.getValue().conversationId()).isEqualTo(String.valueOf(VISITOR_ID));
        assertThat(pushed.getValue().version()).isEqualTo(4);
        assertThat(pushed.getValue().fields()).containsExactly(
            Map.of("label", "城市", "value", Map.of("state", "available", "value", "广州")));
        // 名片推送携带共享标签与备注，不因入站合并而清空
        assertThat(pushed.getValue().tags()).containsExactly("VIP");
        assertThat(pushed.getValue().note()).isEqualTo("备注");
        verify(visitorProfileService).updateById(any(VisitorProfileDO.class));
    }

    @Test
    void doesNotPushProfileFrameWithoutChannelFieldsOrChanges() {
        // 入站不带渠道资料：不推送名片
        deskInboundService.accept(account(), inbound(List.of()));
        verify(deskSocketGateway, never()).pushProfile(anyLong(), anyLong(), any());

        // 渠道资料与库中一致：不重复推送
        when(visitorProfileService.getById(VISITOR_ID)).thenReturn(
            profile(List.of(Map.of("label", "城市", "value", Map.of("state", "available", "value", "广州"))), 3));
        deskInboundService.accept(account(), inbound(List.of(new ChannelInboundMessage.ChannelField("城市", "广州"))));
        verify(deskSocketGateway, never()).pushProfile(anyLong(), anyLong(), any());
    }

    @Test
    void skipsRedeliveredMessageWithoutCountingSavingOrPushing() {
        // 渠道重推（同访客同渠道消息标识已落库）：幂等跳过，不递增计数、不落消息、不推送
        when(messageService.getOne(any(Wrapper.class))).thenReturn(new MessageDO());

        deskInboundService.accept(account(), inbound(List.of()));

        verify(visitorService, never()).update(any(Wrapper.class));
        verify(messageService, never()).save(any(MessageDO.class));
        verify(deskSocketGateway, never()).pushMessage(anyLong(), anyLong(), any(), any());
        verify(deskSocketGateway, never()).pushProfile(anyLong(), anyLong(), any());
    }

    @Test
    void concurrentFirstMessageLoserSkipsAfterSeeingWinnerCommittedMessage() {
        // 并发首信创建访客撞唯一键：败方锁定读回读胜方访客后，重推判定看到胜方已落库的
        // 同标识消息即幂等跳过（uk_message_external 数据库防线，不产生重复计数）
        when(visitorService.getOne(any(Wrapper.class)))
            .thenReturn(null, visitor(VisitorStatusEnum.NEEDS_REPLY, null));
        when(visitorService.save(any(VisitorDO.class))).thenThrow(new DuplicateKeyException("uk_visitor_source"));
        when(messageService.getOne(any(Wrapper.class))).thenReturn(new MessageDO());

        deskInboundService.accept(account(), inbound(List.of()));

        verify(messageService, never()).save(any(MessageDO.class));
        verify(visitorService, never()).update(any(Wrapper.class));
        verify(deskSocketGateway, never()).pushMessage(anyLong(), anyLong(), any(), any());
        verify(deskSocketGateway, never()).pushProfile(anyLong(), anyLong(), any());
    }

    private CompanyChannelDO account() {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyId(COMPANY_ID);
        account.setCompanyChannelId(COMPANY_CHANNEL_ID);
        account.setChannel(ChannelEnum.WECHAT_MP);
        account.setAccountName("公众号");
        return account;
    }

    private ChannelInboundMessage inbound(List<ChannelInboundMessage.ChannelField> fields) {
        return new ChannelInboundMessage(COMPANY_CHANNEL_ID, "ext-1", "小林", null, fields, "msg-1",
            MessageDirectionEnum.INCOMING, Map.of("type", "text", "text", "在吗"));
    }

    private VisitorDO visitor(VisitorStatusEnum status, LocalDateTime waitingSince) {
        VisitorDO visitor = new VisitorDO();
        visitor.setVisitorId(VISITOR_ID);
        visitor.setCompanyId(COMPANY_ID);
        visitor.setCompanyChannelId(COMPANY_CHANNEL_ID);
        visitor.setExternalUserId("ext-1");
        visitor.setStatus(status);
        visitor.setWaitingSince(waitingSince);
        visitor.setMessageCount(1);
        visitor.setVersion(1);
        visitor.setCreateTime(LocalDateTime.now());
        return visitor;
    }

    private VisitorProfileDO profile(List<Map<String, Object>> channelFields, int version) {
        VisitorProfileDO profile = new VisitorProfileDO();
        profile.setVisitorId(VISITOR_ID);
        profile.setChannelFields(channelFields);
        profile.setTags(List.of("VIP"));
        profile.setNote("备注");
        profile.setVersion(version);
        return profile;
    }
}
