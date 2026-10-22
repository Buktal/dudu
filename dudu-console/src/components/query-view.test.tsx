import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { expect, it, vi } from "vitest";
import { QueryView } from "./query-view";

// 骨架测试的固定样式：分页查询投影 + 空态两套文案 + 数据表格槽，断言只针对编排行为。
function viewProps(
  overrides: Partial<ComponentProps<typeof QueryView>> = {},
): ComponentProps<typeof QueryView> {
  return {
    query: {
      list: [{ id: "row-1" }, { id: "row-2" }],
      total: 2,
      page: 1,
      pageSize: 20,
      loading: false,
      error: null,
      refresh: () => {},
      setPage: () => {},
      filtered: false,
    },
    empty: {
      filteredCopy: {
        title: "未找到符合条件的企业",
        description: "调整筛选条件后重试。",
      },
      defaultCopy: { title: "暂无企业", description: "创建第一家企业。" },
    },
    children: <table aria-label="数据表" />,
    ...overrides,
  };
}

it("加载中只呈现加载态，不渲染表格、空态文案与分页", () => {
  const base = viewProps();
  render(
    <QueryView {...viewProps({ query: { ...base.query, loading: true } })} />,
  );
  expect(screen.getByRole("status")).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.queryByText("暂无企业")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("navigation", { name: "分页" }),
  ).not.toBeInTheDocument();
});

it("失败不冒充空数据：有错误时即使列表为空也呈现失败与重试", () => {
  const retry = vi.fn();
  const base = viewProps();
  render(
    <QueryView
      {...viewProps({
        query: {
          ...base.query,
          list: [],
          error: "服务暂时不可用",
          refresh: retry,
        },
      })}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("服务暂时不可用");
  expect(screen.queryByText("暂无企业")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(retry).toHaveBeenCalledTimes(1);
});

it("有数据时渲染表格槽与分页，翻页交给 setPage", () => {
  const setPage = vi.fn();
  const base = viewProps();
  render(
    <QueryView
      {...viewProps({
        query: { ...base.query, page: 2, pageSize: 20, total: 45, setPage },
      })}
    />,
  );
  expect(screen.getByRole("table", { name: "数据表" })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "分页" })).toHaveTextContent(
    "共 45 条 · 第 2 / 3 页",
  );
  fireEvent.click(screen.getByRole("button", { name: "下一页" }));
  expect(setPage).toHaveBeenCalledWith(3);
});

it("空数据时呈现空态与分页，文案按 query.filtered 取向选择", () => {
  const base = viewProps();
  const view = render(
    <QueryView {...viewProps({ query: { ...base.query, list: [] } })} />,
  );
  expect(screen.getByText("暂无企业")).toBeInTheDocument();
  expect(screen.getByText("创建第一家企业。")).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "分页" })).toBeInTheDocument();
  view.rerender(
    <QueryView
      {...viewProps({ query: { ...base.query, list: [], filtered: true } })}
    />,
  );
  expect(screen.getByText("未找到符合条件的企业")).toBeInTheDocument();
  expect(screen.queryByText("暂无企业")).not.toBeInTheDocument();
});

it("空态动作按钮由页面差异提供，并得知当前筛选取向", () => {
  const action = vi.fn((filtered: boolean) => (
    <button type="button">{filtered ? "清除筛选" : "创建企业"}</button>
  ));
  const base = viewProps();
  const view = render(
    <QueryView
      {...viewProps({
        query: { ...base.query, list: [], filtered: true },
        empty: { ...base.empty, action },
      })}
    />,
  );
  expect(screen.getByRole("button", { name: "清除筛选" })).toBeInTheDocument();
  expect(action).toHaveBeenCalledWith(true);

  // 未筛选空态：false 也必须原样转发，页面据此切换为「创建企业」主引导。
  view.rerender(
    <QueryView
      {...viewProps({
        query: { ...base.query, list: [], filtered: false },
        empty: { ...base.empty, action },
      })}
    />,
  );
  expect(screen.getByRole("button", { name: "创建企业" })).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "清除筛选" }),
  ).not.toBeInTheDocument();
  expect(action).toHaveBeenCalledWith(false);
});
