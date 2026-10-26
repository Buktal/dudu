import { createRoot } from "react-dom/client";
import { ThemeProvider } from "/src/components/theme-provider";
import { WorkspaceSettings } from "/src/components/workspace-settings";
import { MessageView } from "/src/features/inbox/components/message-view";
import { TranslationProvider } from "/src/features/translation/provider";
import "/src/index.css";

// 固定验证数据，不读取凭据、不访问供应商。
window.fetch = async (input, init) => {
  await new Promise((resolve) => setTimeout(resolve, 160));
  const preference = { automatic: true, targetLanguage: "zh" };
  const outgoing = String(input).includes("/43/");
  return new Response(
    JSON.stringify({
      code: 0,
      msg: "成功",
      data: String(input).endsWith("preferences")
        ? init?.body
          ? JSON.parse(String(init.body))
          : preference
        : {
            text: outgoing
              ? "您好，我们会在今天下午安排发货，稍后为您发送物流单号。"
              : "你好，我想了解一下发货时间。\n明天能收到吗？",
            targetLanguage: "zh",
            serviceName: "企业百度翻译",
            revision: 1,
          },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};
const message = {
  conversationId: "7",
  createdAt: "2026-10-26T10:00:00",
  sequence: 1,
  version: 1,
};
createRoot(document.getElementById("root")).render(
  <ThemeProvider>
    <TranslationProvider>
      <main className="mx-auto grid max-w-6xl items-start gap-8 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex min-w-0 flex-col gap-6 rounded-2xl border bg-card p-5">
          <header>
            <p className="text-xs text-muted-foreground">
              DUDU DESK · 消息阅读翻译
            </p>
            <h1 className="mt-2 text-lg font-semibold">与来访用户的对话</h1>
          </header>
          <MessageView
            message={{
              ...message,
              id: "42",
              direction: "incoming",
              body: {
                type: "text",
                text: "Hi, I'd like to check when my order will ship.\nCould it arrive tomorrow?",
              },
            }}
          />
          <MessageView
            message={{
              ...message,
              id: "43",
              sequence: 2,
              direction: "outgoing",
              body: {
                type: "text",
                text: "Hello! We'll arrange shipment this afternoon and send you the tracking number shortly.",
              },
              delivery: { state: "sent" },
            }}
          />
        </section>
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="mb-6 text-base font-semibold">工作台设置</h2>
          <WorkspaceSettings />
        </section>
      </main>
    </TranslationProvider>
  </ThemeProvider>,
);
