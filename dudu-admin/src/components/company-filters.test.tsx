import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CompanyFilters } from "./company-filters";

function renderFilters(keyword?: string) {
  const onKeyword = vi.fn();
  const onStatus = vi.fn();
  const onReset = vi.fn();
  const view = render(
    <CompanyFilters
      keyword={keyword}
      onKeyword={onKeyword}
      onStatus={onStatus}
      onReset={onReset}
    />,
  );
  return { ...view, onKeyword, onStatus, onReset };
}

it("输入只改草稿，提交才上报去空格后的关键词", () => {
  const { onKeyword } = renderFilters();
  const input = screen.getByLabelText("搜索企业");
  fireEvent.change(input, { target: { value: " 青禾 " } });
  expect(onKeyword).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "搜索" }));
  expect(onKeyword).toHaveBeenCalledWith("青禾");
});

it("已应用关键词被外部改变时草稿跟随：重置清空，换词同步", async () => {
  const { rerender } = renderFilters("青禾");
  const input = () => screen.getByLabelText("搜索企业");
  // 未提交的草稿不受无关渲染影响
  fireEvent.change(input(), { target: { value: "修改过的草稿" } });
  expect(input()).toHaveValue("修改过的草稿");
  // 外部重置（keyword 回到未筛选）：草稿一并清空
  rerender(
    <CompanyFilters
      keyword={undefined}
      onKeyword={vi.fn()}
      onStatus={vi.fn()}
      onReset={vi.fn()}
    />,
  );
  await waitFor(() => expect(input()).toHaveValue(""));
  // 外部应用新词：草稿同步为新词
  fireEvent.change(input(), { target: { value: "又改" } });
  rerender(
    <CompanyFilters
      keyword="新词"
      onKeyword={vi.fn()}
      onStatus={vi.fn()}
      onReset={vi.fn()}
    />,
  );
  await waitFor(() => expect(input()).toHaveValue("新词"));
});

it("点重置立即清空草稿并上报 onReset", () => {
  const { onReset } = renderFilters("青禾");
  fireEvent.click(screen.getByRole("button", { name: "重置" }));
  expect(onReset).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("搜索企业")).toHaveValue("");
});

it("未提交的搜索草稿也可以直接重置", () => {
  const { onKeyword, onReset } = renderFilters();
  fireEvent.change(screen.getByLabelText("搜索企业"), {
    target: { value: "尚未搜索" },
  });
  fireEvent.click(screen.getByRole("button", { name: "重置" }));
  expect(screen.getByLabelText("搜索企业")).toHaveValue("");
  expect(onReset).toHaveBeenCalledTimes(1);
  expect(onKeyword).not.toHaveBeenCalled();
});
