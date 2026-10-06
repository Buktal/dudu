import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import App from "@/App";
import {
  authenticatedSession,
  company,
  detail,
  failure,
  installHttp,
  page,
  success,
} from "@/test/http";

afterEach(() => vi.unstubAllGlobals());

it("取消停用不发送写请求，失败保持状态，成功后可恢复", async () => {
  let current = company;
  let failDisable = true;
  const request = installHttp((url, init) => {
    const body = () => JSON.parse(String(init.body));
    if (url.pathname.endsWith("/status") && body().status === 0) {
      if (failDisable) return failure(13200, "暂时无法停用");
      current = {
        ...current,
        status: "disabled",
        disableReason: body().disableReason,
      };
      return success(null);
    }
    if (url.pathname.endsWith("/status") && body().status === 1) {
      current = { ...current, status: "enabled", disableReason: null };
      return success(null);
    }
    return url.pathname.endsWith("/123456")
      ? success({ ...detail, company: current })
      : success(page([current]));
  });
  authenticatedSession("#/companies?companyId=123456");
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "停用企业" }));
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(request.mock.calls.some(([, init]) => init.method === "PUT")).toBe(
    false,
  );
  fireEvent.click(screen.getByRole("button", { name: "停用企业" }));
  fireEvent.change(screen.getByLabelText("停用原因"), {
    target: { value: "企业申请暂停" },
  });
  fireEvent.click(screen.getByRole("button", { name: "停用企业" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("暂时无法停用");
  expect(screen.getByLabelText("停用原因")).toHaveValue("企业申请暂停");
  failDisable = false;
  fireEvent.click(screen.getByRole("button", { name: "停用企业" }));
  fireEvent.click(await screen.findByRole("button", { name: "恢复企业" }));
  fireEvent.click(screen.getByRole("button", { name: "恢复企业" }));
  expect(
    await screen.findByRole("button", { name: "停用企业" }),
  ).toBeInTheDocument();
});

it("重置密码明确展示初始管理员，不匹配时不提交，成功后清除输入", async () => {
  const request = installHttp((url) => {
    if (url.pathname.endsWith("/admin_password")) return success(null);
    return url.pathname.endsWith("/123456") ? success(detail) : success(page());
  });
  authenticatedSession("#/companies?companyId=123456");
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "重置密码" }));
  const modal = screen.getByRole("dialog", { name: "重置管理员密码" });
  expect(within(modal).getByText("9007199254740993")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("新密码"), {
    target: { value: "Changed-123" },
  });
  fireEvent.change(screen.getByLabelText("确认新密码"), {
    target: { value: "Different-123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "重置管理员密码" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "两次输入的密码不一致",
  );
  expect(request.mock.calls.some(([, init]) => init.method === "PUT")).toBe(
    false,
  );
  fireEvent.change(screen.getByLabelText("确认新密码"), {
    target: { value: "Changed-123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "重置管理员密码" }));
  await screen.findByRole("button", { name: "重置密码" });
  const mutation = request.mock.calls.find(([, init]) => init.method === "PUT");
  expect(String(mutation?.[0])).toBe(
    "http://127.0.0.1:8080/api/admin/companies/123456/admin_password",
  );
  expect(JSON.parse(String(mutation?.[1].body))).toEqual({
    newPassword: "Changed-123",
  });
  expect(screen.queryByLabelText("新密码")).not.toBeInTheDocument();
});
