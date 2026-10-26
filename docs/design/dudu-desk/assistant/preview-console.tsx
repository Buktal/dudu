import { createRoot } from "react-dom/client";
import { ConsoleClient } from "/src/api/client";
import { ConsoleContext } from "/src/api/context";
import { ConsoleLayout } from "/src/components/console-layout";
import { ThemeProvider } from "/src/components/theme-provider";
import { TranslationPage } from "/src/features/translation/TranslationPage";
import "/src/index.css";

// 2026-10-26 正式配置页的受控数据验收，不读取凭据或访问供应商
const client = new ConsoleClient();
const snapshot = {
  ...client.getSnapshot(),
  profile: {
    company: { companyId: "100001", companyName: "DUDU 演示企业" },
    user: {
      userId: "7",
      username: "admin",
      name: "企业管理员",
      isInitialAdmin: true,
    },
    managedGroupIds: [],
  },
};
client.getSnapshot = () => snapshot;
const field = (key, label, secret = false) => ({
  key,
  label,
  secret,
  required: true,
});
const providers = [
  {
    id: "baidu",
    name: "百度翻译",
    kind: "traditional",
    endpoint: "https://fanyi-api.baidu.com/api/trans/vip/translate",
    fields: [field("appId", "APP ID"), field("secret", "密钥", true)],
    unavailableReason: null,
  },
  {
    id: "custom-openai",
    name: "自定义 OpenAI 兼容",
    kind: "model",
    endpoint: "",
    fields: [field("apiKey", "API Key", true), field("model", "模型")],
    unavailableReason: null,
  },
  {
    id: "deepl",
    name: "DeepL",
    kind: "traditional",
    endpoint: "https://api-free.deepl.com/v2/translate",
    fields: [field("apiKey", "Auth Key", true)],
    unavailableReason: null,
  },
  {
    id: "apple",
    name: "Apple Translate",
    kind: "environment",
    endpoint: "",
    fields: [],
    unavailableReason: "依赖 macOS 本机翻译运行环境",
  },
  {
    id: "tencent",
    name: "腾讯翻译",
    kind: "environment",
    endpoint: "",
    fields: [],
    unavailableReason: "参考项目旧接口缺少当前可用契约，暂不可启用",
  },
];
let settings = {
  revision: 1,
  defaultService: "baidu-1",
  assistantService: "model-1",
  services: [
    {
      id: "baidu-1",
      name: "企业百度翻译",
      provider: "baidu",
      endpoint: providers[0].endpoint,
      values: { appId: "2026102600001", secret: "__DUDU_SECRET_PRESENT__" },
    },
    {
      id: "model-1",
      name: "多语言客服模型",
      provider: "custom-openai",
      endpoint: "https://translate.example.com/v1/chat/completions",
      values: {
        apiKey: "__DUDU_SECRET_PRESENT__",
        model: "customer-service-translator",
      },
    },
  ],
  providers,
};
client.request = async (path, options) => {
  await new Promise((resolve) => setTimeout(resolve, 180));
  if (path.endsWith("/test"))
    return {
      text: "你好，今天有什么可以帮您？",
      serviceName: "企业百度翻译",
      targetLanguage: "zh",
      revision: 0,
    };
  if (options.method === "PUT")
    settings = {
      ...settings,
      ...options.body,
      revision: settings.revision + 1,
    };
  return settings;
};
const theme =
  new URLSearchParams(location.search).get("theme") === "dark"
    ? "dark"
    : "light";
createRoot(document.getElementById("root")).render(
  <ThemeProvider
    defaultTheme={theme}
    storageKey={`dudu-translation-preview-${theme}`}
  >
    <ConsoleContext value={client}>
      <ConsoleLayout view="translation">
        <TranslationPage />
      </ConsoleLayout>
    </ConsoleContext>
  </ThemeProvider>,
);
