import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { FilterBar } from "./filter-bar";

function renderBar({
  value,
  validate,
}: {
  value?: string;
  validate?: (draft: string) => string | undefined;
} = {}) {
  const onSearch = vi.fn();
  const onReset = vi.fn();
  const view = render(
    <FilterBar
      label="测试筛选"
      searchLabel="搜索企业"
      placeholder="搜索企业名称或六位企业 ID"
      value={value}
      validate={validate}
      onSearch={onSearch}
      onReset={onReset}
    />,
  );
  return { ...view, onSearch, onReset };
}

it("输入只改草稿，提交才上报去空格后的关键词", () => {
  const { onSearch } = renderBar();
  const input = screen.getByLabelText("搜索企业");
  fireEvent.change(input, { target: { value: " 青禾 " } });
  expect(onSearch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "搜索" }));
  expect(onSearch).toHaveBeenCalledWith("青禾");
});

it("空串草稿提交归 undefined，不再上报空关键词", () => {
  const { onSearch } = renderBar({ value: "青禾" });
  fireEvent.change(screen.getByLabelText("搜索企业"), {
    target: { value: "   " },
  });
  fireEvent.click(screen.getByRole("button", { name: "搜索" }));
  expect(onSearch).toHaveBeenCalledWith(undefined);
});

it("已应用值被外部改变时草稿跟随：重置清空，换词同步", async () => {
  const { rerender } = renderBar({ value: "青禾" });
  const input = () => screen.getByLabelText("搜索企业");
  // 未提交的草稿不受无关渲染影响
  fireEvent.change(input(), { target: { value: "修改过的草稿" } });
  expect(input()).toHaveValue("修改过的草稿");
  // 外部重置（值回空）：草稿一并清空
  rerender(
    <FilterBar
      label="测试筛选"
      searchLabel="搜索企业"
      placeholder="搜索企业名称或六位企业 ID"
      onSearch={vi.fn()}
      onReset={vi.fn()}
    />,
  );
  await waitFor(() => expect(input()).toHaveValue(""));
  // 外部应用新词：草稿同步为新词
  fireEvent.change(input(), { target: { value: "又改" } });
  rerender(
    <FilterBar
      label="测试筛选"
      searchLabel="搜索企业"
      placeholder="搜索企业名称或六位企业 ID"
      value="新词"
      onSearch={vi.fn()}
      onReset={vi.fn()}
    />,
  );
  await waitFor(() => expect(input()).toHaveValue("新词"));
});

it("点重置立即清空草稿并上报 onReset", () => {
  const { onReset } = renderBar({ value: "青禾" });
  fireEvent.click(screen.getByRole("button", { name: "重置" }));
  expect(onReset).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("搜索企业")).toHaveValue("");
});

it("未提交的搜索草稿也可以直接重置", () => {
  const { onSearch, onReset } = renderBar();
  fireEvent.change(screen.getByLabelText("搜索企业"), {
    target: { value: "尚未搜索" },
  });
  fireEvent.click(screen.getByRole("button", { name: "重置" }));
  expect(screen.getByLabelText("搜索企业")).toHaveValue("");
  expect(onReset).toHaveBeenCalledTimes(1);
  expect(onSearch).not.toHaveBeenCalled();
});

it("校验失败显示错误且不上报，重置同时清除草稿与错误", () => {
  // 与操作记录页同一语义：仅当非空且不是六位企业 ID 时无效
  const validate = (draft: string) =>
    draft !== "" && !/^[1-9]\d{5}$/.test(draft)
      ? "请输入六位企业 ID"
      : undefined;
  const { onSearch, onReset } = renderBar({ validate });
  const input = screen.getByLabelText("搜索企业");
  fireEvent.change(input, { target: { value: "123" } });
  fireEvent.click(screen.getByRole("button", { name: "搜索" }));
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription("请输入六位企业 ID");
  expect(onSearch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "重置" }));
  expect(input).toHaveValue("");
  expect(input).toHaveAttribute("aria-invalid", "false");
  expect(onReset).toHaveBeenCalledTimes(1);
});

it("value 外部变化时草稿跟随并一并清除校验错误", async () => {
  const validate = (draft: string) =>
    draft !== "" && !/^[1-9]\d{5}$/.test(draft)
      ? "请输入六位企业 ID"
      : undefined;
  const { rerender } = renderBar({ validate });
  const input = () => screen.getByLabelText("搜索企业");
  fireEvent.change(input(), { target: { value: "123" } });
  fireEvent.click(screen.getByRole("button", { name: "搜索" }));
  expect(input()).toHaveAttribute("aria-invalid", "true");
  // 外部应用新值（数据方重置回空或换词）：草稿与校验错误一并清除
  rerender(
    <FilterBar
      label="测试筛选"
      searchLabel="搜索企业"
      placeholder="搜索企业名称或六位企业 ID"
      value="123456"
      validate={validate}
      onSearch={vi.fn()}
      onReset={vi.fn()}
    />,
  );
  await waitFor(() => expect(input()).toHaveValue("123456"));
  expect(input()).toHaveAttribute("aria-invalid", "false");
  expect(screen.queryByText("请输入六位企业 ID")).not.toBeInTheDocument();
});
