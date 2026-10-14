import { cleanup, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, expect, it } from "vitest";
import { DESK_SESSION_KEY } from "@/lib/desk-session";
import { createHttpInboxApi } from "../http-inbox-api";
import { loadConversations } from "../stores/queue";
import { inboxActions } from "../stores/slice";
import { createInboxStore } from "../stores/store";
import { firstConversation, testStore } from "../stores/test-support";
import { allowedCapability } from "../test-fixtures";
import { AttachmentPicker } from "./attachment-picker";

/**
 * 附件入口门禁：真实链路只发纯文本，选择入口按能力停用并说明原因（不伪装可用）；
 * 能力声明附件限制时入口可用并展示限制说明。
 */
afterEach(cleanup);

const ORIGIN = "https://desk.example.test";

function realApi() {
  sessionStorage.setItem(
    DESK_SESSION_KEY,
    JSON.stringify({ origin: ORIGIN, token: "stored-token" }),
  );
  return createHttpInboxApi({
    origin: ORIGIN,
    fetcher: async () =>
      Response.json({
        code: 0,
        msg: "操作成功",
        data: {
          items: [
            {
              id: "41",
              identity: {
                id: "41",
                externalUserId: "external-a",
                name: "林小满",
                channelId: "wechat-mp",
                channelName: "微信公众号",
                accountId: "51",
                accountName: "公众号",
              },
              status: "needs-reply",
              preview: "想咨询发货时间",
              updatedAt: "2026-10-12 10:30:15",
              messageCount: 2,
              version: 3,
              capability: { state: "allowed", kinds: ["text"] },
            },
          ],
          total: 1,
          page: 1,
          pageSize: 30,
          counts: { active: 1, needsReply: 1, waiting: 0, closed: 0 },
          channels: [{ id: "wechat-mp", name: "微信公众号" }],
        },
      }),
  });
}

it("disables the attachment picker in the text-only real integration", async () => {
  const store = createInboxStore({
    api: realApi(),
    context: { agentId: "agent", workspaceId: "desk" },
  });
  store.dispatch(inboxActions.connectionChanged("connected"));
  await store.dispatch(loadConversations());
  render(
    <Provider store={store}>
      <AttachmentPicker conversationId="41" />
    </Provider>,
  );

  expect(screen.getByRole("button", { name: "添加附件" })).toBeDisabled();
  expect(screen.getByLabelText("选择待发送的附件")).toBeDisabled();
  expect(screen.getByTitle("当前会话仅支持文字回复")).toBeInTheDocument();
});

it("keeps the attachment picker available when the capability declares attachment limits", async () => {
  const conversation = {
    ...firstConversation,
    capability: allowedCapability(["text", "image"], {
      maxCount: 3,
      maxBytes: 5 * 1024 * 1024,
      mimeTypes: ["image/*"],
    }),
  };
  const store = testStore({
    listConversations: async () => ({
      items: [conversation],
      nextCursor: null,
      total: 1,
    }),
  });
  await store.dispatch(loadConversations());
  render(
    <Provider store={store}>
      <AttachmentPicker conversationId={conversation.id} />
    </Provider>,
  );

  expect(screen.getByRole("button", { name: "添加附件" })).toBeEnabled();
  expect(
    screen.getByTitle("添加附件 · 最多 3 个，单个不超过 5.0 MB"),
  ).toBeInTheDocument();
});
