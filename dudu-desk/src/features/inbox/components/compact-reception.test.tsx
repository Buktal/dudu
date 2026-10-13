import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { openQuickHistory } from "../stores/parallel";
import { loadConversations } from "../stores/queue";
import { loadHistory } from "../stores/reading";
import { inboxActions } from "../stores/slice";
import {
  firstConversation,
  incomingMessage,
  testStore,
} from "../stores/test-support";
import { QueueTools } from "./queue-tools";
import { QuickCard } from "./quick-card";

afterEach(cleanup);
async function setup() {
  const store = testStore();
  await store.dispatch(loadConversations({}));
  const conversation =
    store.getState().inbox.conversations[store.getState().inbox.queue.ids[0]];
  await store.dispatch(loadHistory(conversation.id));
  return { store, conversation };
}

it("keeps a card draft when focus leaves and restores it on reply", async () => {
  const { store, conversation } = await setup();
  render(
    <Provider store={store}>
      <TooltipProvider>
        <QuickCard
          conversation={conversation}
          onInfo={vi.fn()}
          onHistory={vi.fn()}
          infoOpen={false}
        />
      </TooltipProvider>
    </Provider>,
  );
  const reply = `回复 ${conversation.identity.name}`;
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByText(conversation.preview)).toBeInTheDocument();
  expect(
    within(
      screen.getByRole("region", {
        name: `${conversation.identity.name} 的最后一条消息`,
      }),
    ).queryByRole("time"),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: reply }));
  const input = screen.getByRole("textbox");
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: "保留的草稿" } });
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByText("继续草稿")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: reply }));
  expect(screen.getByRole("textbox")).toHaveValue("保留的草稿");
});

it("marks active query conditions and clears the marker with the filters", async () => {
  const { store } = await setup();
  render(
    <Provider store={store}>
      <QueueTools />
    </Provider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "查询条件" }));
  fireEvent.change(await screen.findByRole("searchbox"), {
    target: { value: "齐开慧" },
  });
  expect(
    await screen.findByRole("button", { name: "查询条件（已筛选）" }),
  ).toHaveAttribute("data-filter-active", "true");
  fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "查询条件" }),
    ).not.toHaveAttribute("data-filter-active"),
  );
  expect(screen.getByRole("searchbox")).toHaveValue("");
});

it("shows the latest summary without fetching history until full conversation opens", async () => {
  const listMessages = vi.fn(async () => ({
    items: [incomingMessage(firstConversation.id)],
    nextCursor: null,
  }));
  const store = testStore({ listMessages });
  store.dispatch(
    inboxActions.queueLoaded({
      page: { items: [firstConversation], nextCursor: null },
      append: false,
      preserveIds: [],
    }),
  );
  const card = (preview: string) => (
    <Provider store={store}>
      <TooltipProvider>
        <QuickCard
          conversation={{ ...firstConversation, preview }}
          onInfo={vi.fn()}
          onHistory={(id) => void store.dispatch(openQuickHistory(id))}
          infoOpen={false}
        />
      </TooltipProvider>
    </Provider>
  );
  const view = render(card("访客的上一条消息"));
  expect(screen.getByText("访客的上一条消息")).toBeInTheDocument();
  view.rerender(card("刚收到的最后一条消息"));
  expect(screen.queryByText("访客的上一条消息")).not.toBeInTheDocument();
  expect(screen.getByText("刚收到的最后一条消息")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "回复 林小满" }));
  expect(listMessages).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "查看与 林小满 的完整对话" }),
  );
  await waitFor(() => expect(listMessages).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(
      store.getState().inbox.histories[firstConversation.id].hasLoaded,
    ).toBe(true),
  );
});
