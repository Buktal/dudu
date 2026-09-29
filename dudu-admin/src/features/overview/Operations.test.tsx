import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import App from "@/App";
import {
  authenticatedSession,
  company,
  failure,
  installHttp,
  page,
  success,
} from "@/test/http";

afterEach(() => vi.unstubAllGlobals());

it("概览显示真实返回统计，创建按钮打开开通表单", async () => {
  installHttp((url) =>
    url.pathname.endsWith("/overview")
      ? success({
          totalCompanies: 37,
          enabledCompanies: 30,
          disabledCompanies: 7,
          recentCreatedCount: 6,
          recentCompanies: [company],
        })
      : success(page()),
  );
  authenticatedSession("#/overview");
  render(<App />);
  expect(await screen.findByText("37")).toBeInTheDocument();
  expect(screen.getByText("30")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "创建企业" }));
  expect(
    await screen.findByRole("dialog", { name: "创建企业" }),
  ).toBeInTheDocument();
});

it("资源请求失败时显示失败而非补零", async () => {
  installHttp((url) =>
    url.pathname.endsWith("/resource-summary")
      ? failure(13000, "资源汇总暂不可用")
      : success(page()),
  );
  authenticatedSession("#/resources");
  render(<App />);
  expect(await screen.findByText("资源汇总暂不可用")).toBeInTheDocument();
  expect(screen.queryByRole("cell", { name: "0" })).not.toBeInTheDocument();
});

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
  fireEvent.click(screen.getByRole("button", { name: "查询" }));
  await screen.findByText("未找到符合筛选条件的记录。");
  const call = request.mock.calls.find(([url]) =>
    String(url).includes("companyId=123456"),
  );
  expect(String(call?.[0])).toContain("/api/admin/operation-logs?");
});
