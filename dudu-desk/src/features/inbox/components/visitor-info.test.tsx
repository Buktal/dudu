import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { InboxApi } from "../api";
import { inboxActions } from "../stores/slice";
import type { InboxStore } from "../stores/store";
import {
  firstConversation,
  secondConversation,
  testStore,
} from "../stores/test-support";
import type { VisitorProfile } from "../types";
import { VisitorInfo } from "./visitor-info";

afterEach(cleanup);

const NOTE_PLACEHOLDER = "记下来访用户的偏好与待办事项…";
const CONTEXT = { agentId: "agent-a", workspaceId: "workspace-a" };

function profile(version: number, note: string): VisitorProfile {
  return {
    conversationId: firstConversation.id,
    version,
    fields: [],
    tags: [],
    note,
  };
}

function panel(store: InboxStore, conversationId: string) {
  return (
    <ThemeProvider>
      <Provider store={store}>
        <TooltipProvider>
          <VisitorInfo conversationId={conversationId} />
        </TooltipProvider>
      </Provider>
    </ThemeProvider>
  );
}

function readyStore(api: Partial<InboxApi> = {}) {
  const store = testStore(api);
  store.dispatch(
    inboxActions.queueLoaded({
      page: {
        items: [firstConversation, secondConversation],
        nextCursor: null,
      },
      append: false,
      preserveIds: [],
    }),
  );
  return store;
}

// 他人保存名片后服务端推送的 profile 报文
function sharedUpdate(store: InboxStore, serverProfile: VisitorProfile) {
  store.dispatch(
    inboxActions.eventReceived({
      context: CONTEXT,
      type: "profile",
      profile: serverProfile,
    }),
  );
}

it("refreshes the visible profile from a shared update while nobody is editing", async () => {
  const store = readyStore({
    readProfile: async () => profile(1, "原备注"),
  });
  render(panel(store, firstConversation.id));
  await screen.findByPlaceholderText(NOTE_PLACEHOLDER);

  sharedUpdate(store, profile(2, "他人备注"));

  // 不必切换访客：当前面板直接显示最新服务端资料
  await waitFor(() =>
    expect(screen.getByPlaceholderText(NOTE_PLACEHOLDER)).toHaveValue(
      "他人备注",
    ),
  );
});

it("keeps the local input, marks the update and saves the confirmed overwrite", async () => {
  const baselines: number[] = [];
  const store = readyStore({
    readProfile: async () => profile(1, "原备注"),
    saveProfile: async ({ conversationId, tags, note, version }) => {
      baselines.push(version);
      return { conversationId, version: version + 1, fields: [], tags, note };
    },
  });
  render(panel(store, firstConversation.id));
  const note = await screen.findByPlaceholderText(NOTE_PLACEHOLDER);

  fireEvent.change(note, { target: { value: "本地备注" } });
  sharedUpdate(store, profile(2, "他人备注"));

  // 编辑中的输入保留，并标记资料已被更新
  expect(await screen.findByText("资料已被更新")).toBeInTheDocument();
  expect(note).toHaveValue("本地备注");

  // 保存前提示一次是否覆盖：未确认不发起保存
  fireEvent.click(screen.getByRole("button", { name: "保存资料" }));
  expect(baselines).toEqual([]);
  expect(
    screen.getByText("资料已被他人更新，继续保存会覆盖对方的修改。"),
  ).toBeInTheDocument();

  // 确认后普通保存：以后保存为准，保存内容与用户提交一致
  fireEvent.click(screen.getByRole("button", { name: "确认覆盖" }));
  await waitFor(() => expect(baselines).toEqual([2]));
  await waitFor(() =>
    expect(store.getState().inbox.profiles[firstConversation.id].data).toEqual({
      conversationId: firstConversation.id,
      version: 3,
      fields: [],
      tags: [],
      note: "本地备注",
    }),
  );
});

it("shows the latest server profile when the overwrite prompt is cancelled", async () => {
  const saveProfile = vi.fn();
  const store = readyStore({
    readProfile: async () => profile(1, "原备注"),
    saveProfile,
  });
  render(panel(store, firstConversation.id));
  const note = await screen.findByPlaceholderText(NOTE_PLACEHOLDER);

  fireEvent.change(note, { target: { value: "本地备注" } });
  sharedUpdate(store, profile(2, "他人备注"));
  await screen.findByText("资料已被更新");

  fireEvent.click(screen.getByRole("button", { name: "保存资料" }));
  fireEvent.click(screen.getByRole("button", { name: "取消" }));

  await waitFor(() =>
    expect(screen.getByPlaceholderText(NOTE_PLACEHOLDER)).toHaveValue(
      "他人备注",
    ),
  );
  expect(saveProfile).not.toHaveBeenCalled();
  expect(screen.queryByText("资料已被更新")).not.toBeInTheDocument();
});

it("shows the latest server profile when the draft is discarded", async () => {
  const store = readyStore({
    readProfile: async () => profile(1, "原备注"),
  });
  render(panel(store, firstConversation.id));
  const note = await screen.findByPlaceholderText(NOTE_PLACEHOLDER);

  fireEvent.change(note, { target: { value: "本地备注" } });
  sharedUpdate(store, profile(2, "他人备注"));
  await screen.findByText("资料已被更新");

  // 撤销编辑显示最新服务端资料，而不是编辑开始时的旧版本
  fireEvent.click(screen.getByRole("button", { name: "撤销修改" }));

  await waitFor(() =>
    expect(screen.getByPlaceholderText(NOTE_PLACEHOLDER)).toHaveValue(
      "他人备注",
    ),
  );
});
