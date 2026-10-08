import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiFailure } from "@/lib/api-response";
import type { InboxListPhaseProps } from "./inbox-state";
import { InboxListPhase, isInitialRead } from "./inbox-state";

afterEach(cleanup);

const failure: ApiFailure = { kind: "network", message: "网络开小差了" };

describe("list phase first-read rule", () => {
  it("claims the loading phase only while nothing has settled yet", () => {
    expect(isInitialRead({ hasLoaded: false, status: "loading" })).toBe(true);
    expect(isInitialRead({ hasLoaded: true, status: "loading" })).toBe(false);
    expect(isInitialRead({ hasLoaded: false, status: "idle" })).toBe(false);
    expect(isInitialRead({ hasLoaded: false, status: "error" })).toBe(false);
    expect(isInitialRead({ hasLoaded: true, status: "ready" })).toBe(false);
    expect(isInitialRead(undefined)).toBe(false);
  });
});

function renderListPhase(overrides: Partial<InboxListPhaseProps> = {}) {
  const onRetry = vi.fn();
  const props: InboxListPhaseProps = {
    count: 0,
    error: null,
    onRetry,
    empty: { title: "暂无条目", description: "空空如也。" },
    children: <p>列表内容</p>,
    ...overrides,
  };
  const view = render(<InboxListPhase {...props} />);
  return { onRetry, container: view.container };
}

describe("list phase branches", () => {
  it("shows the full loading surface on a first read, without content or footer", () => {
    renderListPhase({
      read: { hasLoaded: false, status: "loading" },
      count: 0,
      footer: <p>正在加载更多…</p>,
    });
    expect(screen.getByRole("status")).toHaveTextContent("正在读取会话…");
    expect(screen.queryByText("列表内容")).not.toBeInTheDocument();
    expect(screen.queryByText("正在加载更多…")).not.toBeInTheDocument();
  });

  it("keeps the full loading surface on a first read even when entries arrived", () => {
    renderListPhase({
      read: { hasLoaded: false, status: "loading" },
      count: 3,
    });
    expect(screen.getByRole("status")).toHaveTextContent("正在读取会话…");
    expect(screen.queryByText("列表内容")).not.toBeInTheDocument();
  });

  it("honors a custom loading label", () => {
    renderListPhase({
      read: { hasLoaded: false, status: "loading" },
      loadingLabel: "正在读取消息…",
    });
    expect(screen.getByRole("status")).toHaveTextContent("正在读取消息…");
  });

  it("keeps content mounted with the footer while a settled read loads on", () => {
    renderListPhase({
      read: { hasLoaded: true, status: "loading" },
      count: 3,
      footer: <p>正在加载更多…</p>,
    });
    expect(screen.getByText("列表内容")).toBeInTheDocument();
    expect(screen.getByText("正在加载更多…")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("answers an unsettled read without a record with the empty state", () => {
    renderListPhase({ read: undefined, count: 0 });
    expect(screen.getByText("暂无条目")).toBeInTheDocument();
    expect(screen.getByText("空空如也。")).toBeInTheDocument();
  });

  it("shows the retry surface for a failed empty read and wires onRetry", () => {
    const { onRetry } = renderListPhase({
      read: { hasLoaded: false, status: "error" },
      error: failure,
    });
    expect(screen.getByText("暂时无法读取")).toBeInTheDocument();
    expect(screen.queryByText("列表内容")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /重新连接/ }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("keeps the compact error bar beside content and retries the same read by default", () => {
    const { onRetry } = renderListPhase({
      read: { hasLoaded: true, status: "error" },
      count: 3,
      error: failure,
    });
    expect(screen.getByText("列表内容")).toBeInTheDocument();
    expect(screen.getByText("网络开小差了")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /重试/ }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("wraps the compact bar when the content layout needs it and retries the continuation", () => {
    const onRetryMore = vi.fn();
    const { container } = renderListPhase({
      read: { hasLoaded: true, status: "error" },
      count: 3,
      error: failure,
      onRetryMore,
      compactClassName: "p-2",
    });
    const bar = screen.getByRole("button", { name: /重试/ });
    expect(bar.closest(".p-2")).not.toBeNull();
    fireEvent.click(bar);
    expect(onRetryMore).toHaveBeenCalledOnce();
    expect(container.querySelector(".bg-muted")).toBeInTheDocument();
  });

  it("follows the raw in-flight flag for readers without a LoadState", () => {
    const { rerender } = render(
      <InboxListPhase
        loading
        count={0}
        error={null}
        onRetry={() => {}}
        empty={{ title: "暂无条目", description: "空空如也。" }}
      >
        <p>列表内容</p>
      </InboxListPhase>,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    rerender(
      <InboxListPhase
        loading
        count={2}
        error={null}
        onRetry={() => {}}
        empty={{ title: "暂无条目", description: "空空如也。" }}
      >
        <p>列表内容</p>
      </InboxListPhase>,
    );
    expect(screen.getByText("列表内容")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
