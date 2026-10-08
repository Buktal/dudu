import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import App from "@/App";
import { authenticatedSession, installHttp, success } from "@/test/http";

afterEach(() => vi.unstubAllGlobals());

it("操作记录查询使用企业 ID 与服务端操作码，空查询有明确反馈", async () => {
  const request = installHttp(() =>
    success({ list: [], total: 0, page: 1, pageSize: 20 }),
  );
  authenticatedSession("#/logs");
  render(<App />);
  await screen.findByText("暂无操作记录");
  fireEvent.change(screen.getByLabelText("企业 ID"), {
    target: { value: "123456" },
  });
  fireEvent.click(screen.getByRole("button", { name: "搜索" }));
  await screen.findByText("未找到符合筛选条件的记录。");
  const call = request.mock.calls.find(
    ([, init]) => JSON.parse(String(init.body ?? "{}")).companyId === "123456",
  );
  expect(call?.[1].method).toBe("POST");
  expect(String(call?.[0])).toContain("/api/admin/operation_logs/query");
});

it("操作记录的无效 ID 不进入查询，重置同时清除草稿、错误和已应用条件", async () => {
  const request = installHttp(() =>
    success({ list: [], total: 0, page: 1, pageSize: 20 }),
  );
  authenticatedSession("#/logs");
  render(<App />);
  await screen.findByText("暂无操作记录");
  const input = screen.getByRole("textbox", { name: "企业 ID" });
  const queryBodies = () =>
    request.mock.calls
      .filter(([url]) => String(url).includes("/operation_logs/query"))
      .map(([, init]) => JSON.parse(String(init.body)));

  fireEvent.change(input, { target: { value: "123" } });
  fireEvent.click(screen.getByRole("button", { name: "搜索" }));
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription("请输入六位企业 ID");
  expect(queryBodies()).toEqual([{ page: 1, pageSize: 20 }]);
  fireEvent.click(screen.getByRole("button", { name: "重置" }));
  expect(input).toHaveValue("");
  expect(input).toHaveAttribute("aria-invalid", "false");

  fireEvent.change(input, { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "搜索" }));
  await screen.findByText("未找到符合筛选条件的记录。");
  expect(queryBodies().slice(-1)[0]).toEqual({
    page: 1,
    pageSize: 20,
    companyId: "123456",
  });
  fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
  await screen.findByText("企业维护与账号操作完成后，可在这里回查结果。");
  expect(input).toHaveValue("");
  expect(queryBodies().slice(-1)[0]).toEqual({ page: 1, pageSize: 20 });
});

it("空态清除筛选是外部重置：草稿、校验错误与已应用条件一并清除", async () => {
  const request = installHttp(() =>
    success({ list: [], total: 0, page: 1, pageSize: 20 }),
  );
  authenticatedSession("#/logs");
  render(<App />);
  await screen.findByText("暂无操作记录");
  const input = screen.getByRole("textbox", { name: "企业 ID" });
  const queryBodies = () =>
    request.mock.calls
      .filter(([url]) => String(url).includes("/operation_logs/query"))
      .map(([, init]) => JSON.parse(String(init.body)));

  // 先应用有效 ID，进入筛选空态
  fireEvent.change(input, { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "搜索" }));
  await screen.findByText("未找到符合筛选条件的记录。");
  // 再提交无效草稿，出现校验错误（已应用条件不变，清除按钮仍可见）
  fireEvent.change(input, { target: { value: "123" } });
  fireEvent.click(screen.getByRole("button", { name: "搜索" }));
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByText("请输入六位企业 ID")).toBeInTheDocument();
  expect(queryBodies().slice(-1)[0]).toEqual({
    page: 1,
    pageSize: 20,
    companyId: "123456",
  });
  // 空态「清除筛选」走 query.reset：value 外部回空，草稿与校验错误一并清除
  fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
  await screen.findByText("企业维护与账号操作完成后，可在这里回查结果。");
  expect(input).toHaveValue("");
  expect(input).toHaveAttribute("aria-invalid", "false");
  expect(screen.queryByText("请输入六位企业 ID")).not.toBeInTheDocument();
  expect(queryBodies().slice(-1)[0]).toEqual({ page: 1, pageSize: 20 });
});
