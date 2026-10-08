import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CompanyFilters } from "./company-filters";

// 组合层只验证装订：草稿-提交-重置不变量归 filter-bar 单点测试。
function renderFilters({
  keyword,
  status,
}: {
  keyword?: string;
  status?: 0 | 1;
} = {}) {
  const onKeyword = vi.fn();
  const onStatus = vi.fn();
  const onReset = vi.fn();
  const view = render(
    <CompanyFilters
      keyword={keyword}
      status={status}
      onKeyword={onKeyword}
      onStatus={onStatus}
      onReset={onReset}
    />,
  );
  return { ...view, onKeyword, onStatus, onReset };
}

it("搜索提交经 FilterBar 上报去空格后的关键词，空串归 undefined", () => {
  const { onKeyword } = renderFilters();
  const input = screen.getByLabelText("搜索企业");
  fireEvent.change(input, { target: { value: " 青禾 " } });
  fireEvent.click(screen.getByRole("button", { name: "搜索" }));
  expect(onKeyword).toHaveBeenCalledWith("青禾");
  fireEvent.change(input, { target: { value: "   " } });
  fireEvent.click(screen.getByRole("button", { name: "搜索" }));
  expect(onKeyword).toHaveBeenCalledWith(undefined);
});

it("已应用状态下拉即可见重置，无草稿无条件时不渲染", () => {
  const { unmount } = renderFilters({ status: 1 });
  expect(screen.getByRole("button", { name: "重置" })).toBeInTheDocument();
  unmount();
  renderFilters();
  expect(
    screen.queryByRole("button", { name: "重置" }),
  ).not.toBeInTheDocument();
});
