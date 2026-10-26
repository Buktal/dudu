package com.dudu.duduserver.translation;

import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.constant.MessageSendStatusEnum;
import com.dudu.duduserver.entity.TranslationPreferenceDO;
import com.dudu.duduserver.entity.TranslationSettingDO;
import com.dudu.duduserver.service.*;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import static com.dudu.duduserver.translation.TranslationModels.*;

/**
 * 企业服务配置、员工偏好与已授权消息翻译，外部请求不持有数据库锁。
 */
@Service
@RequiredArgsConstructor
public class TranslationService {
    private static final String SECRET_PRESENT = "__DUDU_SECRET_PRESENT__";
    private static final String TEST_TEXT = "Hello, how can I help you today?";
    private static final int MAX_COMPANY_REQUESTS = 4;
    private final TranslationSettings settings;
    private final TranslationPreferences preferences;
    private final ConsoleAccessService consoleAccess;
    private final DeskAuthService deskAuth;
    private final UserService users;
    private final DeskVisitorService visitors;
    private final MessageService messages;
    private final TranslationEngine engine;
    private final TranslationCipher cipher;
    private final TranslationHttp http;
    private final ObjectMapper json;
    private final TransactionTemplate transactions;
    private final ConcurrentHashMap<Long, Semaphore> companySlots = new ConcurrentHashMap<>();

    public View configuration(JwtUser me) {
        consoleAccess.require(me).requireInitialAdmin();
        TranslationSettingDO row = settings.getById(me.companyId());
        return new View(row == null ? 0L : row.getRevision(), row == null ? null : row.getDefaultService(),
            row == null ? null : row.getAssistantService(),
            read(row).stream().map(this::redact).toList(), TranslationCatalog.PROVIDERS);
    }

    public View save(JwtUser me, Save request) {
        transactions.executeWithoutResult(status -> {
            consoleAccess.lock(me).requireInitialAdmin();
            TranslationSettingDO row = settings.getById(me.companyId());
            long revision = row == null ? 0L : row.getRevision();
            if (request.revision() != revision) throw new BizException(ApiEnum.DATA_NOT_ALLOW, "翻译配置已变化，请重新加载后保存");
            List<Configuration> previous = read(row);
            Set<String> ids = new HashSet<>();
            List<Configuration> configs = new ArrayList<>();
            for (Configuration candidate : request.services()) {
                if (!ids.add(candidate.id())) throw new BizException(ApiEnum.PARAM_ERROR, "服务实例标识重复");
                Configuration config = restoreSecrets(candidate, previous);
                TranslationCatalog.validate(config);
                http.validateEndpoint(config.endpoint());
                configs.add(config);
            }
            if (request.defaultService() != null && !ids.contains(request.defaultService())) {
                throw new BizException(ApiEnum.PARAM_ERROR, "默认翻译服务不存在");
            }
            if (request.assistantService() != null && configs.stream().noneMatch(item ->
                item.id().equals(request.assistantService()) && TranslationCatalog.supportsAssistant(item.provider()))) {
                throw new BizException(ApiEnum.PARAM_ERROR, "AI 助手须选择支持通用对话的模型服务");
            }
            TranslationSettingDO updated = new TranslationSettingDO();
            updated.setCompanyId(me.companyId());
            updated.setRevision(revision + 1);
            updated.setDefaultService(request.defaultService());
            updated.setAssistantService(request.assistantService());
            try { updated.setConfiguration(cipher.encrypt(me.companyId(), json.writeValueAsString(configs))); }
            catch (com.fasterxml.jackson.core.JsonProcessingException error) { throw new BizException(ApiEnum.DATA_ERROR); }
            if (row == null) settings.save(updated); else settings.updateById(updated);
        });
        return configuration(me);
    }

    public Result test(JwtUser me, Test request) {
        consoleAccess.require(me).requireInitialAdmin();
        Configuration config = restoreSecrets(request.configuration(), read(settings.getById(me.companyId())));
        String text = execute(me.companyId(), config, TEST_TEXT, request.targetLanguage());
        consoleAccess.require(me).requireInitialAdmin();
        return new Result(text, request.targetLanguage(), config.name(), 0L);
    }

    public Preference preference(JwtUser me) {
        deskAuth.requireAccess(me);
        TranslationPreferenceDO row = preferences.getById(me.userId());
        if (row == null || !me.companyId().equals(row.getCompanyId())) return new Preference(false, "zh");
        return new Preference(row.getAutomatic(), row.getTargetLanguage());
    }

    public Preference savePreference(JwtUser me, Preference request) {
        transactions.executeWithoutResult(status -> {
            // 员工行锁收敛同账户跨设备首次写入竞争，不持锁外呼。
            users.lambdaQuery().eq(com.dudu.duduserver.entity.UserDO::getUserId, me.userId())
                .last(com.dudu.duduserver.util.LockClauses.LOCK_ROW).one();
            deskAuth.requireAccess(me);
            if (!TranslationEngine.LANGUAGES.contains(request.targetLanguage())) throw new BizException(ApiEnum.PARAM_ERROR);
            TranslationPreferenceDO row = new TranslationPreferenceDO();
            row.setUserId(me.userId());
            row.setCompanyId(me.companyId());
            row.setAutomatic(request.automatic());
            row.setTargetLanguage(request.targetLanguage());
            preferences.saveOrUpdate(row);
        });
        return request;
    }

    public Result translate(JwtUser me, Long messageId, Request request) {
        deskAuth.requireAccess(me);
        var message = messages.getById(messageId);
        if (message == null) throw new BizException(ApiEnum.DATA_NOT_EXIST);
        visitors.get(me, String.valueOf(message.getVisitorId()));
        if (!Objects.equals(message.getVersion().longValue(), request.version())
            || message.getDirection() == MessageDirectionEnum.OUTGOING && message.getSendStatus() != MessageSendStatusEnum.SENT
            || !"text".equals(message.getContent().get("type")) || !(message.getContent().get("text") instanceof String text)) {
            throw new BizException(ApiEnum.DATA_NOT_ALLOW, "仅支持当前版本的已保存文本消息");
        }
        TranslationSettingDO row = settings.getById(me.companyId());
        if (row == null || row.getDefaultService() == null) throw new BizException(ApiEnum.DATA_NOT_ALLOW, "企业尚未配置默认翻译服务，请联系企业管理员");
        Configuration config = read(row).stream().filter(item -> item.id().equals(row.getDefaultService())).findFirst()
            .orElseThrow(() -> new BizException(ApiEnum.DATA_NOT_ALLOW, "默认翻译服务不存在"));
        String translated = execute(me.companyId(), config, text, request.targetLanguage());
        // 外部请求期间权限或配置可能变化，完成时再次校验，禁止迟到结果越权返回。
        visitors.get(me, String.valueOf(message.getVisitorId()));
        TranslationSettingDO current = settings.getById(me.companyId());
        if (current == null || !Objects.equals(row.getRevision(), current.getRevision())) {
            throw new BizException(ApiEnum.DATA_NOT_ALLOW, "翻译服务配置已变化，请重试");
        }
        return new Result(translated, request.targetLanguage(), config.name(), row.getRevision());
    }

    // AI 助手复用企业服务实例与加密凭据，选择项独立于阅读翻译。
    public ModelConfiguration assistantConfiguration(JwtUser me) {
        deskAuth.requireAccess(me);
        TranslationSettingDO row = settings.getById(me.companyId());
        if (row == null || row.getAssistantService() == null) return null;
        Configuration config = read(row).stream()
            .filter(item -> item.id().equals(row.getAssistantService()))
            .findFirst().orElseThrow(() -> new BizException(ApiEnum.DATA_NOT_ALLOW, "AI 助手模型服务不存在"));
        if (!TranslationCatalog.supportsAssistant(config.provider())) {
            throw new BizException(ApiEnum.DATA_NOT_ALLOW, "所选服务不支持 AI 对话，请联系企业管理员");
        }
        return new ModelConfiguration(config, row.getRevision());
    }

    public String assist(Long companyId, Configuration config, String instruction, List<Map<String, String>> turns) {
        return limited(companyId, () -> engine.chat(config, instruction, turns));
    }

    public void requireAssistantRevision(JwtUser me, Long revision) {
        TranslationSettingDO current = settings.getById(me.companyId());
        if (current == null || !Objects.equals(current.getRevision(), revision)) {
            throw new BizException(ApiEnum.DATA_NOT_ALLOW, "模型服务配置已变化，请重试");
        }
    }

    private String execute(Long companyId, Configuration config, String text, String language) {
        return limited(companyId, () -> engine.translate(config, text, language));
    }

    private String limited(Long companyId, java.util.function.Supplier<String> action) {
        Semaphore slots = companySlots.computeIfAbsent(companyId, ignored -> new Semaphore(MAX_COMPANY_REQUESTS));
        if (!slots.tryAcquire()) throw new BizException(ApiEnum.DATA_NOT_ALLOW, "企业模型或翻译请求较多，请稍后重试");
        try { return action.get(); }
        finally { slots.release(); }
    }

    private List<Configuration> read(TranslationSettingDO row) {
        if (row == null) return List.of();
        try { return json.readValue(cipher.decrypt(row.getCompanyId(), row.getConfiguration()), new TypeReference<>() { }); }
        catch (com.fasterxml.jackson.core.JsonProcessingException error) { throw new BizException(ApiEnum.DATA_ERROR, "翻译配置内容无效"); }
    }

    private Configuration redact(Configuration config) {
        Map<String, String> values = new HashMap<>(config.values());
        for (Field field : TranslationCatalog.require(config.provider()).fields()) {
            if (field.secret() && !values.getOrDefault(field.key(), "").isEmpty()) values.put(field.key(), SECRET_PRESENT);
        }
        return new Configuration(config.id(), config.name(), config.provider(), config.endpoint(), values);
    }

    private Configuration restoreSecrets(Configuration config, List<Configuration> previous) {
        Map<String, String> values = new HashMap<>(config.values());
        Configuration old = previous.stream().filter(item -> item.id().equals(config.id()) && item.provider().equals(config.provider())).findFirst().orElse(null);
        for (Field field : TranslationCatalog.require(config.provider()).fields()) {
            if (field.secret() && SECRET_PRESENT.equals(values.get(field.key()))) {
                if (old == null) throw new BizException(ApiEnum.PARAM_ERROR, "请填写服务凭据");
                values.put(field.key(), old.values().getOrDefault(field.key(), ""));
            }
        }
        return new Configuration(config.id(), config.name(), config.provider(), config.endpoint(), values);
    }
}
