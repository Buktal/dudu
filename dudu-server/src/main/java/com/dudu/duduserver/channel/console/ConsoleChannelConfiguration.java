package com.dudu.duduserver.channel.console;

import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.ChannelEnum;
import org.springframework.stereotype.Component;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Console 配置写入边界：白名单合并、必需配置、固定身份保护与安全读模型；不发外部网络请求。
 */
@Component
public class ConsoleChannelConfiguration {
    private static final int MAX_FIELD_LENGTH = 4096;
    private static final int MAX_PEM_LENGTH = 16384;
    private static final String TELEGRAM_BASE = "https://api.telegram.org/bot";
    private static final Pattern BOT_TOKEN = Pattern.compile("([0-9]+):[A-Za-z0-9_-]+");
    private static final Pattern BOT_URL = Pattern.compile("https://api\\.telegram\\.org/bot([0-9]+):[A-Za-z0-9_-]+");
    private static final String UNSUPPORTED_SYSTEM = "当前接入方式不受支持，请初始管理员新建账号";
    private static final String SYSTEM_AGENT = "agent";
    private static final String SYSTEM_HTTP_CRYPTO = "http_crypto";

    public Map<String, Object> merge(ChannelEnum channel, Map<String, Object> previous,
                                      Map<String, Object> set, List<String> clear, String callbackUrl) {
        ConsoleChannelDefinition definition = ConsoleChannelDefinitions.require(channel);
        if (set == null || clear == null) throw new BizException(ApiEnum.PARAM_MISSING);
        if (!supportedSystem(channel, previous)) throw new BizException(ApiEnum.DATA_NOT_ALLOW, UNSUPPORTED_SYSTEM);
        Map<String, Object> result = new LinkedHashMap<>(previous);
        Map<String, ConsoleChannelDefinition.Field> fields = new LinkedHashMap<>();
        definition.fields().forEach(field -> fields.put(field.key(), field));
        for (String key : clear) {
            if (!fields.containsKey(key) || set.containsKey(key)) throw new BizException(ApiEnum.PARAM_ERROR);
            ensureMutable(fields.get(key), previous, null);
            result.remove(key);
        }
        for (Map.Entry<String, Object> entry : set.entrySet()) {
            ConsoleChannelDefinition.Field field = fields.get(entry.getKey());
            if (field == null || !(entry.getValue() instanceof String value) || value.isBlank()) {
                throw new BizException(ApiEnum.PARAM_ERROR, "配置字段无效或为空白");
            }
            if (value.length() > ("textarea".equals(field.control()) ? MAX_PEM_LENGTH : MAX_FIELD_LENGTH)) {
                throw new BizException(ApiEnum.PARAM_EXCEED, "配置字段过长");
            }
            String normalized = field.secret() || "textarea".equals(field.control()) ? value : value.trim();
            ensureMutable(field, previous, normalized);
            result.put(entry.getKey(), normalized);
        }
        if (channel == ChannelEnum.TELEGRAM) mergeTelegram(previous, set, clear, result);
        if (channel == ChannelEnum.WHATSAPP) result.put("url", callbackUrl);
        if (channel == ChannelEnum.WECOM) result.put("system", SYSTEM_AGENT);
        if (channel == ChannelEnum.DINGTALK) result.put("system", SYSTEM_HTTP_CRYPTO);
        Status status = describe(channel, result);
        if (!status.receiveConfigured()) {
            throw new BizException(ApiEnum.DATA_NOT_ALLOW, "接收配置不完整：" + String.join("、", status.missingReceiveFields()));
        }
        return result;
    }

    public Status describe(ChannelEnum channel, Map<String, Object> info) {
        if (ConsoleChannelDefinitions.ALL.stream().noneMatch(definition -> definition.channel() == channel)) {
            return new Status(false, false, List.of("channel"), List.of("channel"), Map.of(), List.of(),
                List.of("当前渠道不支持控制台配置，仅保留既有账号记录。"));
        }
        ConsoleChannelDefinition definition = ConsoleChannelDefinitions.require(channel);
        Map<String, String> visible = new LinkedHashMap<>();
        List<String> secrets = new ArrayList<>();
        List<String> receive = new ArrayList<>();
        List<String> send = new ArrayList<>();
        for (ConsoleChannelDefinition.Field field : definition.fields()) {
            String value = text(info, field.key().equals("botToken") && channel == ChannelEnum.TELEGRAM ? "url" : field.key());
            if (value != null) {
                if (field.secret()) secrets.add(field.key());
                else visible.put(field.key(), value);
            } else {
                if (field.requiredForReceive()) receive.add(field.key());
                if (field.requiredForSend()) send.add(field.key());
            }
        }
        if (channel == ChannelEnum.WECHAT_MINI && text(info, "encodingAesKey") != null
            && text(info, "appId") == null && !receive.contains("appId")) receive.add("appId");
        if (channel == ChannelEnum.WHATSAPP && text(info, "url") == null) receive.add("callbackUrl");
        List<String> notes = new ArrayList<>();
        if (!supportedSystem(channel, info)) {
            notes.add(UNSUPPORTED_SYSTEM);
            receive.add("system");
        }
        if (channel == ChannelEnum.TELEGRAM && text(info, "url") != null && !BOT_URL.matcher(text(info, "url")).matches()) {
            notes.add("旧发送地址无法核验 Bot 身份，不能原地替换或清除发送凭据，请初始管理员新建账号。");
        }
        return new Status(receive.isEmpty(), send.isEmpty() && supportedSystem(channel, info), List.copyOf(receive), List.copyOf(send),
            Map.copyOf(visible), List.copyOf(secrets), List.copyOf(notes));
    }

    private void ensureMutable(ConsoleChannelDefinition.Field field, Map<String, Object> previous, String next) {
        String current = text(previous, field.key());
        if (field.immutableOnceConfigured() && current != null && !current.trim().equals(next)) {
            throw new BizException(ApiEnum.DATA_NOT_ALLOW, "账号身份已固定，更换外部账号请新建记录");
        }
    }

    private void mergeTelegram(Map<String, Object> previous, Map<String, Object> set, List<String> clear,
                               Map<String, Object> result) {
        String oldUrl = text(previous, "url");
        String botId = text(previous, "botId");
        if (oldUrl != null) {
            Matcher match = BOT_URL.matcher(oldUrl);
            if (!match.matches()) {
                if (set.containsKey("botToken") || clear.contains("botToken")) {
                    throw new BizException(ApiEnum.DATA_NOT_ALLOW, "旧发送地址无法核验身份，请初始管理员新建账号");
                }
            } else {
                if (botId != null && !botId.equals(match.group(1))) throw new BizException(ApiEnum.DATA_NOT_ALLOW);
                botId = match.group(1);
            }
        }
        if (set.containsKey("botToken")) {
            String token = (String) set.get("botToken");
            Matcher match = BOT_TOKEN.matcher(token);
            if (!match.matches()) throw new BizException(ApiEnum.PARAM_ERROR, "Bot Token 格式不正确");
            if (botId != null && !botId.equals(match.group(1))) {
                throw new BizException(ApiEnum.DATA_NOT_ALLOW, "不能换绑其他 Bot ID，请新建账号");
            }
            botId = match.group(1);
            result.put("url", TELEGRAM_BASE + token);
        }
        if (clear.contains("botToken")) result.remove("url");
        result.remove("botToken");
        if (botId != null) result.put("botId", botId);
    }

    private boolean supportedSystem(ChannelEnum channel, Map<String, Object> info) {
        String system = text(info, "system");
        return system == null || (channel != ChannelEnum.WECOM && channel != ChannelEnum.DINGTALK)
            || (channel == ChannelEnum.WECOM && SYSTEM_AGENT.equals(system))
            || (channel == ChannelEnum.DINGTALK && SYSTEM_HTTP_CRYPTO.equals(system));
    }

    private static String text(Map<String, Object> info, String key) {
        Object value = info.get(key);
        return value instanceof String text && !text.isBlank() ? text : null;
    }

    public record Status(Boolean receiveConfigured, Boolean sendConfigured, List<String> missingReceiveFields,
                         List<String> missingSendFields, Map<String, String> fields,
                         List<String> configuredSecretFields, List<String> notes) {
    }
}
