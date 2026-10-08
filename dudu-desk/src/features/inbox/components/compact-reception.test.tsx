import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createDevelopmentInboxApi } from "../development-api";
import { loadConversations } from "../stores/queue";
import { loadHistory } from "../stores/reading";
import { createInboxStore } from "../stores/store";
import { QueueTools } from "./queue-tools";
import { QuickCard } from "./quick-card";

afterEach(cleanup);
async function setup() {
  const { api } = createDevelopmentInboxApi();
  const store = createInboxStore({
    api,
    context: { agentId: "agent", workspaceId: "workspace" },
  });
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
  expect(screen.getAllByRole("time").length).toBeGreaterThan(1);
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
