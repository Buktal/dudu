package com.dudu.duduserver.service;

import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.constant.VisitorStatusEnum;
import com.dudu.duduserver.dto.DeskVisitorQueryDTO;
import com.dudu.duduserver.entity.VisitorDO;
import com.dudu.duduserver.service.impl.DeskVisitorServiceImpl;
import com.dudu.duduserver.vo.DeskAccessVO;
import com.dudu.duduserver.vo.DeskConversationVO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
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
    private final DeskVisitorService deskVisitorService =
        new DeskVisitorServiceImpl(deskAuthService, visitorService);

    private final JwtUser me = new JwtUser(COMPANY_ID, 9L, UserRoleEnum.CONSOLE, 0L);

    @BeforeEach
    void setUp() {
        when(deskAuthService.requireAccess(me)).thenReturn(
            new DeskAccessVO(false, List.of(new DeskAccessVO.Group("31", "售前")),
                List.of(new DeskAccessVO.Account(ACCOUNT_ID, "31", ChannelEnum.WECHAT, "公众号"))));
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
            Arguments.of(ApiEnum.PARAM_ERROR.code, query(1, 30, "", "telegram")));
    }

    @Test
    void detailReadsSnapshotWithStringIdsAndWaitingFieldsOnlyWhenNeedsReply() {
        when(visitorService.getById(VISITOR_ID)).thenReturn(visitorWithLastMessage());

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
        assertThat(view.identity().channelId()).isEqualTo("wechat");
        assertThat(view.identity().channelName()).isEqualTo("微信");
        assertThat(view.identity().accountId()).isEqualTo(ACCOUNT_ID);
        assertThat(view.identity().accountName()).isEqualTo("公众号");
        assertThat(view.capability().state()).isEqualTo("restricted");
        assertThat(view.capability().kinds()).isEmpty();
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

    private void assertCodeForbidden(Long visitorId) {
        assertThatThrownBy(() -> deskVisitorService.get(me, String.valueOf(visitorId)))
            .isInstanceOf(BizException.class)
            .extracting(error -> ((BizException) error).apiEnum().code)
            .isEqualTo(ApiEnum.FORBIDDEN.code);
    }

    private static DeskVisitorQueryDTO query(int page, int pageSize, String search, String channelId) {
        return new DeskVisitorQueryDTO(search, channelId, null, null, page, pageSize);
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
