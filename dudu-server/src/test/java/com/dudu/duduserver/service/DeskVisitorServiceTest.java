package com.dudu.duduserver.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.channel.ChannelAdapterRegistry;
import com.dudu.duduserver.channel.wechatmp.WechatMpAdapter;
import com.dudu.duduserver.channel.wechatmp.WechatMpMediaReader;
import com.dudu.duduserver.channel.wechatmp.WechatMpProtocol;
import com.dudu.duduserver.channel.wechatmp.WechatMpTextSender;
import com.dudu.duduserver.util.DeskConversationViews;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.constant.MessageSendStatusEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.constant.VisitorStatusEnum;
import com.dudu.duduserver.dto.DeskHistoryQueryDTO;
import com.dudu.duduserver.dto.DeskVisitorQueryDTO;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.entity.MessageDO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.entity.VisitorDO;
import com.dudu.duduserver.service.impl.DeskVisitorServiceImpl;
import com.dudu.duduserver.socket.DeskSocketGateway;
import com.dudu.duduserver.vo.DeskAccessVO;
import com.dudu.duduserver.vo.DeskConversationVO;
import com.dudu.duduserver.vo.DeskMessagePageVO;
import com.dudu.duduserver.vo.DeskMessageVO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.web.client.RestClient;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 访客查询服务单元验证：输入范围校验与单访客快照的错误码、投影与缺省回落；
 * 真实 SQL、排序与计数由独立 MySQL 验收覆盖（DeskVisitorIntegrationTest）。
 */
class DeskVisitorServiceTest {

    private static final Long COMPANY_ID = 784101L;
    private static final Long VISITOR_ID = 41L;
    private static final String ACCOUNT_ID = "51";

    private final DeskAuthService deskAuthService = mock(DeskAuthService.class);
    private final VisitorService visitorService = mock(VisitorService.class);
    private final MessageService messageService = mock(MessageService.class);
    private final UserService userService = mock(UserService.class);
    private final CompanyChannelService companyChannelService = mock(CompanyChannelService.class);
    private final DeskSocketGateway deskSocketGateway = mock(DeskSocketGateway.class);
    private final DeskVisitorService deskVisitorService = new DeskVisitorServiceImpl(
        deskAuthService, visitorService, messageService, userService, companyChannelService, deskSocketGateway,
        deskConversationViews());
    // 能力说明走真实注册表与公众号适配器；本类只用其限制说明，不发起渠道请求
    private static DeskConversationViews deskConversationViews() {
        WechatMpAdapter wechatMp = new WechatMpAdapter(new WechatMpProtocol(),
            new WechatMpTextSender(RestClient.builder(), "http://127.0.0.1:9"),
            new WechatMpMediaReader(RestClient.builder(), "http://127.0.0.1:9"));
        return new DeskConversationViews(new ChannelAdapterRegistry(List.of(wechatMp)));
    }


    private final JwtUser me = new JwtUser(COMPANY_ID, 9L, UserRoleEnum.CONSOLE, 0L);

    @BeforeEach
    void setUp() {
        when(deskAuthService.requireAccess(me)).thenReturn(
            new DeskAccessVO(false, List.of(new DeskAccessVO.Group("31", "售前")),
                List.of(new DeskAccessVO.Account(ACCOUNT_ID, "31", ChannelEnum.WECHAT_MP, "公众号"))));
    }

    @ParameterizedTest
    @MethodSource("outOfRangeQueries")
    void queryRejectsOutOfRangeInputBeforeReadingPersistence(int expectedCode, DeskVisitorQueryDTO query) {
        assertThatThrownBy(() -> deskVisitorService.query(me, query))
            .isInstanceOf(BizException.class)
            .extracting(error -> ((BizException) error).apiEnum().code)
            .isEqualTo(expectedCode);
        verifyNoInteractions(visitorService);
    }

    static Stream<Arguments> outOfRangeQueries() {
        return Stream.of(
            Arguments.of(ApiEnum.PARAM_ERROR.code, query(0, 30, "", "all")),
            Arguments.of(ApiEnum.PARAM_ERROR.code, query(1, 0, "", "all")),
            Arguments.of(ApiEnum.PARAM_EXCEED.code, query(1, 101, "", "all")),
            Arguments.of(ApiEnum.PARAM_EXCEED.code, query(1, 30, "x".repeat(101), "all")),
            Arguments.of(ApiEnum.PARAM_ERROR.code, query(1, 30, "", "no-such-channel")));
    }

    @Test
    void detailReadsSnapshotWithStringIdsAndWaitingFieldsOnlyWhenNeedsReply() {
        when(visitorService.getById(VISITOR_ID)).thenReturn(visitorWithLastMessage());
        // 未配置发送凭据的公众号账号如实返回不可发能力，不编造可发
        when(companyChannelService.getById(Long.valueOf(ACCOUNT_ID))).thenReturn(channelAccount(Map.of("token", "t")));

        DeskConversationVO view = deskVisitorService.get(me, String.valueOf(VISITOR_ID));

        assertThat(view.id()).isEqualTo("41");
        assertThat(view.status()).isEqualTo(VisitorStatusEnum.NEEDS_REPLY);
        assertThat(view.preview()).isEqualTo("最后一条摘要");
        assertThat(view.updatedAt()).isEqualTo(LocalDateTime.of(2026, 10, 12, 10, 30, 15));
        assertThat(view.waitingSince()).isEqualTo(LocalDateTime.of(2026, 10, 12, 10, 0, 0));
        assertThat(view.messageCount()).isEqualTo(7);
        assertThat(view.version()).isEqualTo(3);
        assertThat(view.identity().id()).isEqualTo("41");
        assertThat(view.identity().externalUserId()).isEqualTo("external-a");
        assertThat(view.identity().channelId()).isEqualTo("wechat-mp");
        assertThat(view.identity().channelName()).isEqualTo("微信公众号");
        assertThat(view.identity().accountId()).isEqualTo(ACCOUNT_ID);
        assertThat(view.identity().accountName()).isEqualTo("公众号");
        assertThat(view.capability().state()).isEqualTo("restricted");
        assertThat(view.capability().kinds()).isEmpty();
        assertThat(view.capability().reason()).isEqualTo("渠道发送凭据未配置");
    }

    @Test
    void detailFallsBackToCreateTimeAndOmitsWaitingFieldsOutsideNeedsReply() {
        VisitorDO visitor = visitorWithLastMessage();
        visitor.setStatus(VisitorStatusEnum.WAITING);
        visitor.setLastMessageTime(null);
        when(visitorService.getById(VISITOR_ID)).thenReturn(visitor);

        DeskConversationVO view = deskVisitorService.get(me, String.valueOf(VISITOR_ID));

        assertThat(view.updatedAt()).isEqualTo(LocalDateTime.of(2026, 10, 12, 9, 0, 0));
        assertThat(view.waitingSince()).isNull();
    }

    @Test
    void detailDistinguishesInvalidMissingForbiddenAndForeignVisitors() {
        assertThatThrownBy(() -> deskVisitorService.get(me, "not-a-number"))
            .isInstanceOf(BizException.class)
            .extracting(error -> ((BizException) error).apiEnum().code)
            .isEqualTo(ApiEnum.PARAM_ERROR.code);

        assertThatThrownBy(() -> deskVisitorService.get(me, "999999"))
            .isInstanceOf(BizException.class)
            .extracting(error -> ((BizException) error).apiEnum().code)
            .isEqualTo(ApiEnum.DATA_NOT_EXIST.code);

        // 其他企业的访客与当前授权账号之外的访客都按无访问权限处理，不区分提示
        VisitorDO foreign = visitorWithLastMessage();
        foreign.setCompanyId(784102L);
        when(visitorService.getById(VISITOR_ID)).thenReturn(foreign);
        assertCodeForbidden(VISITOR_ID);

        VisitorDO unauthorizedChannel = visitorWithLastMessage();
        unauthorizedChannel.setCompanyChannelId(99L);
        when(visitorService.getById(VISITOR_ID)).thenReturn(unauthorizedChannel);
        assertCodeForbidden(VISITOR_ID);
    }

    @ParameterizedTest
    @MethodSource("invalidHistoryQueries")
    void historyRejectsInvalidPagingInputBeforeReadingPersistence(int expectedCode, String beforeSequence, String limit) {
        assertThatThrownBy(() -> deskVisitorService.history(me, String.valueOf(VISITOR_ID),
            new DeskHistoryQueryDTO(beforeSequence, limit)))
            .isInstanceOf(BizException.class)
            .extracting(error -> ((BizException) error).apiEnum().code)
            .isEqualTo(expectedCode);
        verifyNoInteractions(visitorService, messageService);
    }

    static Stream<Arguments> invalidHistoryQueries() {
        return Stream.of(
            Arguments.of(ApiEnum.PARAM_ERROR.code, "abc", null),
            Arguments.of(ApiEnum.PARAM_ERROR.code, "0", null),
            Arguments.of(ApiEnum.PARAM_ERROR.code, "-1", null),
            Arguments.of(ApiEnum.PARAM_ERROR.code, null, "0"),
            Arguments.of(ApiEnum.PARAM_ERROR.code, null, "abc"),
            Arguments.of(ApiEnum.PARAM_EXCEED.code, null, "101"));
    }

    @Test
    void historyReturnsTheRecentPageAscendingWithAnEarlierCursorAndTheFullMessageProjection() {
        when(visitorService.getById(VISITOR_ID)).thenReturn(visitorWithLastMessage());
        // SQL 按 sequence 降序取 limit + 1 条：多出的一条只用于判断还有更早消息
        when(messageService.page(any(Page.class), any())).thenAnswer(invocation -> {
            Page<MessageDO> page = invocation.getArgument(0);
            page.setRecords(List.of(message(3, MessageDirectionEnum.INCOMING),
                message(2, MessageDirectionEnum.OUTGOING), message(1, MessageDirectionEnum.INCOMING)));
            return page;
        });
        when(userService.listByIds(any())).thenReturn(List.of(agent("9", "林舟")));

        DeskMessagePageVO page =
            deskVisitorService.history(me, String.valueOf(VISITOR_ID), new DeskHistoryQueryDTO(null, "2"));

        // 最近一页取 limit + 1 中的最新两条并按升序返回；多出的最旧一条（sequence 1）不返回
        assertThat(page.items()).extracting(DeskMessageVO::sequence).containsExactly(2, 3);
        assertThat(page.nextCursor()).isEqualTo("2");

        // outgoing 增加发送员工、显示名与发送结果；本票无发送接口，字段为后续票复用
        DeskMessageVO outgoing = page.items().get(0);
        assertThat(outgoing.id()).isEqualTo("2");
        assertThat(outgoing.conversationId()).isEqualTo("41");
        assertThat(outgoing.direction()).isEqualTo(MessageDirectionEnum.OUTGOING);
        assertThat(outgoing.body()).isEqualTo(Map.of("type", "text", "text", "消息 2"));
        assertThat(outgoing.createdAt()).isEqualTo(LocalDateTime.of(2026, 10, 12, 9, 2, 0));
        assertThat(outgoing.version()).isEqualTo(1);
        assertThat(outgoing.clientRequestId()).isEqualTo("client-2");
        assertThat(outgoing.senderUserId()).isEqualTo("9");
        assertThat(outgoing.senderName()).isEqualTo("林舟");
        assertThat(outgoing.delivery()).isEqualTo(new DeskMessageVO.Delivery("sent", null));

        // 其他方向不返回发送员工、气泡标识与发送结果
        DeskMessageVO incoming = page.items().get(1);
        assertThat(incoming.id()).isEqualTo("3");
        assertThat(incoming.direction()).isEqualTo(MessageDirectionEnum.INCOMING);
        assertThat(incoming.body()).isEqualTo(Map.of("type", "text", "text", "消息 3"));
        assertThat(incoming.createdAt()).isEqualTo(LocalDateTime.of(2026, 10, 12, 9, 3, 0));
        assertThat(incoming.clientRequestId()).isNull();
        assertThat(incoming.senderUserId()).isNull();
        assertThat(incoming.senderName()).isNull();
        assertThat(incoming.delivery()).isNull();
    }

    @Test
    void historyCarriesTheFailedReasonAndOmitsTheCursorWhenTheConversationFits() {
        when(visitorService.getById(VISITOR_ID)).thenReturn(visitorWithLastMessage());
        MessageDO failed = message(2, MessageDirectionEnum.OUTGOING);
        failed.setSendStatus(MessageSendStatusEnum.FAILED);
        failed.setFailureReason("渠道拒绝");
        when(messageService.page(any(Page.class), any())).thenAnswer(invocation -> {
            Page<MessageDO> page = invocation.getArgument(0);
            page.setRecords(List.of(failed, message(1, MessageDirectionEnum.INCOMING)));
            return page;
        });
        when(userService.listByIds(any())).thenReturn(List.of(agent("9", "林舟")));

        DeskMessagePageVO page =
            deskVisitorService.history(me, String.valueOf(VISITOR_ID), new DeskHistoryQueryDTO(null, null));

        assertThat(page.items()).hasSize(2);
        assertThat(page.nextCursor()).isNull();
        assertThat(page.items().get(1).delivery())
            .isEqualTo(new DeskMessageVO.Delivery("failed", "渠道拒绝"));

        // 空历史：空 items + 无更早游标，且不为空结果查询员工显示名
        when(messageService.page(any(Page.class), any())).thenAnswer(invocation -> {
            Page<MessageDO> empty = invocation.getArgument(0);
            empty.setRecords(List.of());
            return empty;
        });
        DeskMessagePageVO none =
            deskVisitorService.history(me, String.valueOf(VISITOR_ID), new DeskHistoryQueryDTO("5", null));
        assertThat(none.items()).isEmpty();
        assertThat(none.nextCursor()).isNull();
        verify(userService).listByIds(any());
    }

    @Test
    void historySharesTheVisitorAccessRules() {
        assertThatThrownBy(() -> deskVisitorService.history(me, "not-a-number", new DeskHistoryQueryDTO(null, null)))
            .isInstanceOf(BizException.class)
            .extracting(error -> ((BizException) error).apiEnum().code)
            .isEqualTo(ApiEnum.PARAM_ERROR.code);

        assertThatThrownBy(() -> deskVisitorService.history(me, "999999", new DeskHistoryQueryDTO(null, null)))
            .isInstanceOf(BizException.class)
            .extracting(error -> ((BizException) error).apiEnum().code)
            .isEqualTo(ApiEnum.DATA_NOT_EXIST.code);

        VisitorDO foreign = visitorWithLastMessage();
        foreign.setCompanyId(784102L);
        when(visitorService.getById(VISITOR_ID)).thenReturn(foreign);
        assertThatThrownBy(() -> deskVisitorService.history(me, String.valueOf(VISITOR_ID),
            new DeskHistoryQueryDTO(null, null)))
            .isInstanceOf(BizException.class)
            .extracting(error -> ((BizException) error).apiEnum().code)
            .isEqualTo(ApiEnum.FORBIDDEN.code);
        verifyNoInteractions(messageService);
    }

    private MessageDO message(int sequence, MessageDirectionEnum direction) {
        MessageDO message = new MessageDO();
        message.setMessageId((long) sequence);
        message.setVisitorId(VISITOR_ID);
        message.setSequence(sequence);
        message.setDirection(direction);
        message.setContent(Map.of("type", "text", "text", "消息 " + sequence));
        message.setVersion(1);
        message.setCreateTime(LocalDateTime.of(2026, 10, 12, 9, sequence, 0));
        message.setUpdateTime(message.getCreateTime());
        if (direction == MessageDirectionEnum.OUTGOING) {
            message.setSenderUserId(9L);
            message.setClientRequestId("client-" + sequence);
            message.setSendStatus(MessageSendStatusEnum.SENT);
        }
        return message;
    }

    private UserDO agent(String userId, String name) {
        UserDO user = new UserDO();
        user.setUserId(Long.valueOf(userId));
        user.setName(name);
        return user;
    }

    private void assertCodeForbidden(Long visitorId) {
        assertThatThrownBy(() -> deskVisitorService.get(me, String.valueOf(visitorId)))
            .isInstanceOf(BizException.class)
            .extracting(error -> ((BizException) error).apiEnum().code)
            .isEqualTo(ApiEnum.FORBIDDEN.code);
    }

    private static DeskVisitorQueryDTO query(int page, int pageSize, String search, String channelId) {
        return new DeskVisitorQueryDTO(search, channelId, null, null, page, pageSize);
    }

    private CompanyChannelDO channelAccount(Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(Long.valueOf(ACCOUNT_ID));
        account.setChannel(ChannelEnum.WECHAT_MP);
        account.setAccountName("公众号");
        account.setChannelInfo(channelInfo);
        return account;
    }

    private VisitorDO visitorWithLastMessage() {
        VisitorDO visitor = new VisitorDO();
        visitor.setVisitorId(VISITOR_ID);
        visitor.setCompanyId(COMPANY_ID);
        visitor.setCompanyChannelId(Long.valueOf(ACCOUNT_ID));
        visitor.setExternalUserId("external-a");
        visitor.setName("林小满");
        visitor.setStatus(VisitorStatusEnum.NEEDS_REPLY);
        visitor.setLastMessagePreview("最后一条摘要");
        visitor.setLastMessageTime(LocalDateTime.of(2026, 10, 12, 10, 30, 15));
        visitor.setWaitingSince(LocalDateTime.of(2026, 10, 12, 10, 0, 0));
        visitor.setMessageCount(7);
        visitor.setVersion(3);
        visitor.setCreateTime(LocalDateTime.of(2026, 10, 12, 9, 0, 0));
        return visitor;
    }
}
