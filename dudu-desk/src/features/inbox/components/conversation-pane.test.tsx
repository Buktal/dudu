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
  incomingMessage,
  secondConversation,
  testStore,
} from "../stores/test-support";
import { ConversationPane } from "./conversation-pane";

afterEach(cleanup);

/**
 * 完整对话展示是最近页读取的唯一触发点：专注主窗、并排另一侧与卡片展开都经此组件，
 * 已初始化的访客切回时直接复用缓存，不重复查询历史。
 */
function pane(store: InboxStore, conversationId: string) {
  return (
    <ThemeProvider>
      <Provider store={store}>
        <TooltipProvider>
          <ConversationPane conversationId={conversationId} onInfo={() => {}} />
        </TooltipProvider>
      </Provider>
    </ThemeProvider>
  );
}

function readyStore(listMessages: InboxApi["listMessages"]) {
  const store = testStore({ listMessages });
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

it("reads the recent page once when a conversation is first shown and reuses the cache", async () => {
  const listMessages = vi.fn(async ({ conversationId }) => ({
    items: [incomingMessage(conversationId)],
    nextCursor: null,
  }));
  const store = readyStore(listMessages);

  const view = render(pane(store, firstConversation.id));
  await waitFor(() => expect(listMessages).toHaveBeenCalledTimes(1));
  expect(listMessages).toHaveBeenCalledWith(
    expect.objectContaining({
      conversationId: firstConversation.id,
      cursor: undefined,
    }),
  );

  // 并排另一侧显示另一位访客：各读各的历史
  view.rerender(pane(store, secondConversation.id));
  await waitFor(() => expect(listMessages).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(
      store.getState().inbox.histories[secondConversation.id].hasLoaded,
    ).toBe(true),
  );

  // 切回已初始化的访客：直接复用缓存，不再查询
  view.rerender(pane(store, firstConversation.id));
  await waitFor(() =>
    expect(
      store.getState().inbox.histories[firstConversation.id].hasLoaded,
    ).toBe(true),
  );
  expect(listMessages).toHaveBeenCalledTimes(2);
});

it("shows an empty conversation instead of loading forever", async () => {
  const store = readyStore(
    vi.fn(async () => ({ items: [], nextCursor: null })),
  );

  render(pane(store, firstConversation.id));

  expect(await screen.findByText("这段会话还没有消息")).toBeInTheDocument();
});

it("shows a failed read with retry that reads the recent page again", async () => {
  const listMessages = vi
    .fn()
    .mockRejectedValueOnce(new Error("暂时无法连接服务"))
    .mockResolvedValueOnce({
      items: [incomingMessage(firstConversation.id)],
      nextCursor: null,
    });
  const store = readyStore(listMessages);

  render(pane(store, firstConversation.id));

  const retry = await screen.findByRole("button", { name: /重新连接/ });
  expect(listMessages).toHaveBeenCalledTimes(1);

  fireEvent.click(retry);

  await waitFor(() => expect(listMessages).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: /重新连接/ }),
    ).not.toBeInTheDocument(),
  );
});
