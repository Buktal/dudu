package com.dudu.duduserver.assistant;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.constant.MessageSendStatusEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.entity.MessageDO;
import com.dudu.duduserver.entity.VisitorDO;
import com.dudu.duduserver.service.DeskProfileService;
import com.dudu.duduserver.service.DeskVisitorService;
import com.dudu.duduserver.service.MessageService;
import com.dudu.duduserver.translation.TranslationModels;
import com.dudu.duduserver.translation.TranslationService;
import com.dudu.duduserver.vo.DeskVisitorProfileVO;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.ArgumentMatchers;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 真实权限边界、有限上下文和迟到结果的行为验证。
 */
class AssistantServiceTest {
    private final TranslationService translation = mock(TranslationService.class);
    private final DeskVisitorService visitors = mock(DeskVisitorService.class);
    private final DeskProfileService profiles = mock(DeskProfileService.class);
    private final MessageService messages = mock(MessageService.class);
    private final JwtUser me = new JwtUser(100001L, 7L, UserRoleEnum.USER, Long.MAX_VALUE);
    private final AssistantService service = new AssistantService(translation, visitors, profiles, messages, new ObjectMapper());
    private final AssistantModels.Request request = new AssistantModels.Request("请拟回复", "reply", "当前草稿", List.of());
    private final VisitorDO visitor = new VisitorDO();

    @BeforeEach
    void setup() {
        visitor.setVisitorId(20L);
        visitor.setName("来访用户");
        when(visitors.requireAuthorizedVisitor(me, "20")).thenReturn(visitor);
        when(profiles.profile(me, "20")).thenReturn(new DeskVisitorProfileVO("20", 1, List.of(), List.of("售后"), "内部信息"));
        var config = new TranslationModels.Configuration("model", "企业模型", "custom-openai", "https://example.com/chat", Map.of("model", "configured", "apiKey", "private"));
        when(translation.assistantConfiguration(me)).thenReturn(new TranslationModels.ModelConfiguration(config, 2L));
        when(translation.assist(anyLong(), any(), anyString(), anyList())).thenReturn("建议回复");
        when(messages.list(ArgumentMatchers.<Wrapper<MessageDO>>any())).thenReturn(List.of(message(1, "最新问题")));
    }

    @Test
    void unauthorizedVisitorNeverReachesModelOrReadsMessages() {
        when(visitors.requireAuthorizedVisitor(me, "20")).thenThrow(new BizException(ApiEnum.DATA_NOT_ALLOW));
        assertThatThrownBy(() -> service.ask(me, "20", request)).isInstanceOf(BizException.class);
        verifyNoInteractions(translation, profiles, messages);
    }

    @Test
    void unconfiguredAssistantDoesNotCallExternalService() {
        when(translation.assistantConfiguration(me)).thenReturn(null);
        assertThat(service.availability(me).enabled()).isFalse();
        assertThatThrownBy(() -> service.ask(me, "20", request)).hasMessageContaining("尚未启用");
        verify(translation, never()).assist(anyLong(), any(), anyString(), anyList());
    }

    @Test
    void revokedAccessDuringGenerationDoesNotReturnResult() {
        when(visitors.requireAuthorizedVisitor(me, "20")).thenReturn(visitor).thenThrow(new BizException(ApiEnum.DATA_NOT_ALLOW));
        assertThatThrownBy(() -> service.ask(me, "20", request)).isInstanceOf(BizException.class);
        verify(translation).assist(anyLong(), any(), anyString(), anyList());
    }

    @Test
    void configurationChangeDuringGenerationDoesNotReturnResult() {
        doThrow(new BizException(ApiEnum.DATA_NOT_ALLOW, "配置已变化")).when(translation).requireAssistantRevision(me, 2L);
        assertThatThrownBy(() -> service.ask(me, "20", request)).hasMessageContaining("配置已变化");
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void contextContainsOnlySavedTextAndNeverWritesOriginalMessages() {
        MessageDO failed = message(2, "失败正文不得作为已发承诺");
        failed.setDirection(MessageDirectionEnum.OUTGOING);
        failed.setSendStatus(MessageSendStatusEnum.FAILED);
        when(messages.list(ArgumentMatchers.<Wrapper<MessageDO>>any())).thenReturn(List.of(failed, message(1, "已授权的来信")));
        var result = service.ask(me, "20", request);
        ArgumentCaptor<List<Map<String, String>>> turns = ArgumentCaptor.forClass((Class) List.class);
        verify(translation).assist(eq(me.companyId()), any(), anyString(), turns.capture());
        assertThat(turns.getValue().toString()).contains("已授权的来信", "内部信息", "当前草稿").doesNotContain("失败正文");
        assertThat(result.contextMessageCount()).isEqualTo(1);
        assertThat(result.visitorId()).isEqualTo("20");
        verify(messages, never()).updateById(any());
        verify(visitors, times(2)).requireAuthorizedVisitor(me, "20");
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void oversizedContextKeepsRecentMessagesAndReportsTruncation() {
        var recent = java.util.stream.IntStream.range(0, 8).mapToObj(index -> message(index, "内容".repeat(1500))).toList();
        when(messages.list(ArgumentMatchers.<Wrapper<MessageDO>>any())).thenReturn(recent);
        var result = service.ask(me, "20", request);
        assertThat(result.contextTruncated()).isTrue();
        assertThat(result.contextMessageCount()).isEqualTo(5);
    }

    private MessageDO message(int sequence, String text) {
        MessageDO message = new MessageDO();
        message.setSequence(sequence);
        message.setDirection(MessageDirectionEnum.INCOMING);
        message.setContent(Map.of("type", "text", "text", text));
        return message;
    }
}
