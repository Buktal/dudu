package com.dudu.duduserver.translation;

import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import java.util.List;
import static com.dudu.duduserver.translation.TranslationModels.*;

/**
 * Easydict 服务目录的服务端适配清单；受环境限制的项目明确不可配置。
 */
public final class TranslationCatalog {
    private TranslationCatalog() { }
    private static Field field(String key, String label, boolean secret) {
        return new Field(key, label, secret, true);
    }
    private static final List<Field> MODEL = List.of(field("apiKey", "API Key", true), field("model", "模型", false));
    private static Provider model(String id, String name, String endpoint) {
        return new Provider(id, name, "model", endpoint, MODEL, null);
    }
    private static Provider regular(String id, String name, String endpoint, Field... fields) {
        return new Provider(id, name, "traditional", endpoint, List.of(fields), null);
    }
    private static Provider unavailable(String id, String name, String reason) {
        return new Provider(id, name, "environment", "", List.of(), reason);
    }
    public static final List<Provider> PROVIDERS = List.of(
        regular("youdao", "有道翻译", "https://openapi.youdao.com/api", field("appId", "应用 ID", false), field("secret", "应用密钥", true)),
        model("openai", "OpenAI", "https://api.openai.com/v1/chat/completions"),
        model("deepseek", "DeepSeek", "https://api.deepseek.com/chat/completions"),
        model("groq", "Groq", "https://api.groq.com/openai/v1/chat/completions"),
        model("zhipu", "智谱", "https://open.bigmodel.cn/api/paas/v4/chat/completions"),
        model("minimax", "MiniMax", "https://api.minimax.chat/v1/text/chatcompletion_v2"),
        model("gemini", "Gemini", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"),
        model("claude", "Claude", "https://api.anthropic.com/v1/messages"),
        new Provider("ollama", "Ollama", "model", "http://localhost:11434/api/chat", List.of(field("model", "模型", false)), null),
        model("custom-openai", "自定义 OpenAI 兼容", ""),
        regular("deepl", "DeepL", "https://api-free.deepl.com/v2/translate", field("apiKey", "Auth Key", true)),
        regular("google", "Google Cloud Translation", "https://translation.googleapis.com/language/translate/v2", field("apiKey", "API Key", true)),
        regular("baidu", "百度翻译", "https://fanyi-api.baidu.com/api/trans/vip/translate", field("appId", "APP ID", false), field("secret", "密钥", true)),
        regular("bing", "Microsoft Translator", "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0", field("apiKey", "订阅密钥", true), field("region", "资源地域", false)),
        regular("volcano", "火山翻译", "https://translate.volcengineapi.com/?Action=TranslateText&Version=2020-06-01", field("accessKey", "Access Key ID", false), field("secret", "Secret Access Key", true), field("region", "地域", false)),
        regular("niutrans", "小牛翻译", "https://api.niutrans.com/NiuTransServer/translation", field("apiKey", "API Key", true)),
        regular("caiyun", "彩云小译", "https://api.interpreter.caiyunai.com/v1/translator", field("apiKey", "Token", true)),
        regular("alibaba", "阿里翻译", "https://mt.cn-hangzhou.aliyuncs.com/", field("accessKey", "Access Key ID", false), field("secret", "Access Key Secret", true)),
        model("doubao", "豆包翻译", "https://ark.cn-beijing.volces.com/api/v3/responses"),
        unavailable("tencent", "腾讯翻译", "参考项目 TextTranslate 旧接口缺少当前可用契约，暂不可启用"),
        unavailable("apple-dictionary", "Apple Dictionary", "依赖 macOS 本机词典，非整句消息翻译"),
        unavailable("mdict", "MDict", "依赖本地词典资源，非整句消息翻译"),
        unavailable("apple", "Apple Translate", "依赖 macOS 本机翻译运行环境"),
        unavailable("builtin-ai", "Easydict 内置 AI", "参考项目内置访问不能转用于 DUDU"),
        unavailable("claude-code", "Claude Code", "依赖本机 CLI 与独立登录环境"),
        unavailable("codex-cli", "Codex CLI", "依赖本机 CLI 与独立登录环境"),
        unavailable("github-copilot", "GitHub Copilot", "依赖独立账户授权环境"),
        unavailable("polishing", "润色", "超出本期消息阅读翻译范围"),
        unavailable("summary", "摘要", "超出本期消息阅读翻译范围")
    );
    public static Provider require(String id) {
        return PROVIDERS.stream().filter(p -> p.id().equals(id)).findFirst()
            .orElseThrow(() -> new BizException(ApiEnum.PARAM_ERROR, "未知翻译服务"));
    }
    public static void validate(Configuration config) {
        Provider provider = require(config.provider());
        if (provider.unavailableReason() != null) throw new BizException(ApiEnum.DATA_NOT_ALLOW, provider.unavailableReason());
        if (config.values().values().stream().anyMatch(value -> value == null || value.chars().anyMatch(Character::isISOControl))) {
            throw new BizException(ApiEnum.PARAM_ERROR, "翻译配置字段不得包含空值或控制字符");
        }
        if (config.values().keySet().stream().anyMatch(key -> provider.fields().stream().noneMatch(f -> f.key().equals(key)))) {
            throw new BizException(ApiEnum.PARAM_ERROR, "翻译配置包含未知字段");
        }
        for (Field field : provider.fields()) {
            if (field.required() && config.values().getOrDefault(field.key(), "").isBlank()) {
                throw new BizException(ApiEnum.PARAM_MISSING, "请填写" + field.label());
            }
        }
        if (config.endpoint() == null || config.endpoint().isBlank()) {
            throw new BizException(ApiEnum.PARAM_MISSING, "请填写翻译接口地址");
        }
    }
}
