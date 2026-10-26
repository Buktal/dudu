// 2026-10-26 正式组件的受控接口验收，不读取真实凭据或调用供应商
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "/src/components/theme-provider";
import { InboxWorkspace, unavailableInboxApi } from "/src/features/inbox";
import "/src/index.css";

const date = "2026-10-26T11:00:00+08:00";
const ids = ["20", "30"];
let conversations = ids.map((id, index) => ({
  id,
  identity: { id, externalUserId: `review-${id}`, name: index ? "周一鸣" : "林小满",
    channelId: index ? "telegram" : "wechat-mp", channelName: index ? "Telegram" : "微信公众号",
    accountId: `review-account-${id}`, accountName: index ? "技术支持" : "生活旗舰店" },
  status: "needs-reply", preview: index ? "安装时卡在 60%，需要什么信息？" : "尺码偏大，可以退货吗？运费怎么承担？",
  updatedAt: date, waitingSince: date, messageCount: 3, version: 1, capability: { state: "allowed", kinds: ["text"] },
}));
const histories = Object.fromEntries(conversations.map((visitor, index) => [visitor.id, [
  index ? "你好，安装到一半卡住了。" : "您好，前天收到的衣服尺码有点大。",
  index ? "请问系统和安装包版本是什么？" : "您好，请问衣服是否穿洗过，吊牌是否完整？",
  visitor.preview,
].map((text, i) => ({ id: `${visitor.id}-${i}`, conversationId: visitor.id, sequence: i + 1, version: 1,
  direction: i === 1 ? "outgoing" : "incoming", body: { type: "text", text }, createdAt: date,
  ...(i === 1 ? { delivery: { state: "sent" } } : {}),
}))]));
const api = {
  ...unavailableInboxApi,
  subscribe: ({ onConnection }) => { onConnection("connected"); return () => {}; },
  listConversations: async () => ({ items: structuredClone(conversations), nextCursor: null, total: conversations.length }),
  listMessages: async ({ conversationId }) => ({ items: structuredClone(histories[conversationId]), nextCursor: null }),
  readProfile: async ({ conversationId }) => ({ conversationId, version: 1, fields: [], tags: ["验收数据"], note: "尚未核实订单，不承诺费用" }),
  send: async (input) => {
    const id = input.target.conversationId;
    const message = { id: `sent-${histories[id].length}`, conversationId: id, clientRequestId: input.clientRequestId,
      direction: "outgoing", body: { type: "text", text: input.text }, createdAt: date, sequence: histories[id].length + 1,
      version: 1, delivery: { state: "sent" } };
    histories[id] = [...histories[id], message];
    conversations = conversations.map((value) => value.id === id ? { ...value, status: "waiting", preview: input.text, version: value.version + 1 } : value);
    return message;
  },
};
let failed = false;
window.fetch = async (input, init) => {
  const path = String(input);
  const params = new URLSearchParams(location.search);
  const signal = init?.signal;
  await new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const timer = setTimeout(resolve, params.has("slow") ? 2000 : 450);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  });
  let data;
  let code = 0;
  let msg = "成功";
  if (path.endsWith("/assistant") && init?.method !== "POST") {
    data = { enabled: !params.has("unconfigured"), serviceName: params.has("unconfigured") ? null : "验收模型替身" };
  } else if (/\/visitors\/[^/]+\/assistant$/.test(path)) {
    if (params.has("fail") && !failed) { code = 13100; msg = "验收用模型失败，请重试"; failed = true; data = null; }
    else {
      const visitorId = path.match(/\/visitors\/([^/]+)/)[1];
      const request = JSON.parse(init.body);
      data = { visitorId, text: request.task === "summary" ? "咨询事项：来访用户希望了解处理方式。\n已知情况：已提供初步描述。\n待确认：需要补充订单或问题信息。"
        : visitorId === "20" ? "您好，方便提供订单号吗？我先帮您核实退货条件和运费安排，再说明后续步骤。" : "您好，方便提供系统版本、安装截图和日志吗？我帮您继续排查。",
      serviceName: "验收模型替身", revision: 1, contextMessageCount: histories[visitorId].length, contextTruncated: false };
    }
  } else throw new Error(`未定义的验收请求：${path}`);
  return new Response(JSON.stringify({ code, msg, data }), { headers: { "Content-Type": "application/json" } });
};
createRoot(document.getElementById("root")).render(<ThemeProvider><InboxWorkspace api={api} context={{ agentId: "review-agent", workspaceId: "review-workspace" }} accountMenu={<span className="text-xs text-muted-foreground">受控接口验收数据</span>} /></ThemeProvider>);
