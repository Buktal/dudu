package com.dudu.duduserver.translation;

import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.UserRoleEnum;
import com.dudu.duduserver.entity.MessageDO;
import com.dudu.duduserver.entity.TranslationSettingDO;
import com.dudu.duduserver.service.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.Map;
import static com.dudu.duduserver.translation.TranslationModels.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * 已授权消息、迟到权限变化与配置变化的外部行为断言。
 */
class TranslationServiceTest {
    private final TranslationSettings settings = mock(TranslationSettings.class);
    private final TranslationPreferences preferences = mock(TranslationPreferences.class);
    private final ConsoleAccessService console = mock(ConsoleAccessService.class);
    private final DeskAuthService auth = mock(DeskAuthService.class);
    private final DeskVisitorService visitors = mock(DeskVisitorService.class);
    private final MessageService messages = mock(MessageService.class);
    private final TranslationEngine engine = mock(TranslationEngine.class);
    private final TranslationCipher cipher = mock(TranslationCipher.class);
    private final JwtUser me = new JwtUser(100001L, 7L, UserRoleEnum.USER, Long.MAX_VALUE);
    private final TranslationService service = new TranslationService(settings, preferences, console, auth,
        mock(UserService.class), visitors, messages, engine, cipher, mock(TranslationHttp.class), new ObjectMapper(), mock(TransactionTemplate.class));

    @BeforeEach
    void setup() {
        var company = new com.dudu.duduserver.entity.CompanyDO();
        company.setCompanyId(me.companyId());
        company.setInitUserId(me.userId());
        var user = new com.dudu.duduserver.entity.UserDO();
        user.setUserId(me.userId());
        when(console.require(me)).thenReturn(new ConsoleAccess(company, user, java.util.Set.of()));
        MessageDO message = new MessageDO();
        message.setMessageId(42L);
        message.setVisitorId(20L);
        message.setVersion(1);
        message.setContent(Map.of("type", "text", "text", "Hello"));
        when(messages.getById(42L)).thenReturn(message);
        TranslationSettingDO row = new TranslationSettingDO();
        row.setCompanyId(me.companyId());
        row.setRevision(1L);
        row.setDefaultService("default");
        row.setConfiguration("encrypted");
        when(settings.getById(me.companyId())).thenReturn(row);
        when(cipher.decrypt(me.companyId(), "encrypted")).thenReturn("[{\"id\":\"default\",\"name\":\"翻译服务\",\"provider\":\"openai\",\"endpoint\":\"https://example.com/chat\",\"values\":{\"apiKey\":\"private\",\"model\":\"model\"}}]");
        when(engine.translate(any(), eq("Hello"), eq("zh"))).thenReturn("你好");
    }

    @Test
    void unauthorizedMessageNeverReachesExternalProvider() {
        when(visitors.get(me, "20")).thenThrow(new BizException(ApiEnum.DATA_NOT_EXIST));
        assertThatThrownBy(() -> service.translate(me, 42L, new Request(1L, "zh"))).isInstanceOf(BizException.class);
        verifyNoInteractions(engine);
    }
    @Test
    void staleMessageVersionDoesNotTranslate() {
        assertThatThrownBy(() -> service.translate(me, 42L, new Request(2L, "zh"))).isInstanceOf(BizException.class);
        verifyNoInteractions(engine);
    }
    @Test
    void permissionsRevokedDuringTranslationDiscardResult() {
        when(visitors.get(me, "20")).thenReturn(null).thenThrow(new BizException(ApiEnum.DATA_NOT_EXIST));
        assertThatThrownBy(() -> service.translate(me, 42L, new Request(1L, "zh"))).isInstanceOf(BizException.class);
        verify(engine).translate(any(), eq("Hello"), eq("zh"));
    }
    @Test
    void configurationChangeDuringTranslationDiscardResult() {
        TranslationSettingDO changed = new TranslationSettingDO();
        changed.setRevision(2L);
        var initial = settings.getById(me.companyId());
        when(settings.getById(me.companyId())).thenReturn(initial, changed);
        assertThatThrownBy(() -> service.translate(me, 42L, new Request(1L, "zh"))).hasMessageContaining("配置已变化");
    }
    @Test
    void successfulTranslationDoesNotUpdateOriginalMessage() {
        assertThat(service.translate(me, 42L, new Request(1L, "zh"))).isEqualTo(new Result("你好", "zh", "翻译服务", 1L));
        verify(visitors, times(2)).get(me, "20");
        verify(messages, never()).updateById(any());
    }
    @Test
    void configurationReadMasksSecrets() {
        assertThat(service.configuration(me).services().getFirst().values().get("apiKey")).isEqualTo("__DUDU_SECRET_PRESENT__");
        assertThat(service.configuration(me).toString()).doesNotContain("private");
    }
    @Test
    void groupAdministratorCannotReadCompanyWideTranslationCredentials() {
        var company = new com.dudu.duduserver.entity.CompanyDO();
        company.setCompanyId(me.companyId());
        company.setInitUserId(99L);
        var user = new com.dudu.duduserver.entity.UserDO();
        user.setUserId(me.userId());
        when(console.require(me)).thenReturn(new ConsoleAccess(company, user, java.util.Set.of()));
        assertThatThrownBy(() -> service.configuration(me)).isInstanceOf(BizException.class);
    }

    @Test
    void assistantSelectionIsIndependentAndUsesEncryptedModelConfiguration() {
        var row = settings.getById(me.companyId());
        assertThat(service.assistantConfiguration(me)).isNull();
        row.setAssistantService("default");
        var selected = service.assistantConfiguration(me);
        assertThat(selected.configuration().name()).isEqualTo("翻译服务");
        assertThat(selected.revision()).isEqualTo(1L);
        assertThat(service.configuration(me).assistantService()).isEqualTo("default");
        assertThat(service.configuration(me).toString()).doesNotContain("private");
        assertThat(row.getDefaultService()).isEqualTo("default");
        verifyNoInteractions(engine);
    }

    @Test
    void assistantRejectsMissingOrTranslationOnlyService() {
        var row = settings.getById(me.companyId());
        row.setAssistantService("missing");
        assertThatThrownBy(() -> service.assistantConfiguration(me)).isInstanceOf(BizException.class);
        row.setAssistantService("default");
        when(cipher.decrypt(me.companyId(), "encrypted")).thenReturn("[{\"id\":\"default\",\"name\":\"常规翻译\",\"provider\":\"deepl\",\"endpoint\":\"https://example.com/translate\",\"values\":{\"apiKey\":\"private\"}}]");
        assertThatThrownBy(() -> service.assistantConfiguration(me)).hasMessageContaining("不支持 AI 对话");
        verifyNoInteractions(engine);
    }
}
