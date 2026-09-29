import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import App from "@/App";
import {
  authenticatedSession,
  failure,
  installHttp,
  success,
} from "@/test/http";

afterEach(() => vi.unstubAllGlobals());

it("原密码错误保留表单，改密成功清除身份并要求重新登录", async () => {
  let wrong = true;
  const request = installHttp(() =>
    wrong ? failure(13310, "原密码错误") : success(null),
  );
  authenticatedSession("#/account");
  render(<App />);
  await screen.findByLabelText("当前密码");
  fireEvent.change(screen.getByLabelText("当前密码"), {
    target: { value: "old-password" },
  });
  fireEvent.change(screen.getByLabelText("新密码"), {
    target: { value: "new-password" },
  });
  fireEvent.change(screen.getByLabelText("确认新密码"), {
    target: { value: "new-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "修改密码" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("原密码错误");
  expect(screen.getByLabelText("新密码")).toHaveValue("new-password");
  wrong = false;
  fireEvent.click(screen.getByRole("button", { name: "修改密码" }));
  expect(
    await screen.findByRole("heading", { name: "登录管理后台" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("密码已修改");
  expect(sessionStorage.getItem("dudu-admin.session")).toBeNull();
  const mutation = request.mock.calls.find(([, init]) => init.method === "PUT");
  expect(JSON.parse(String(mutation?.[1].body))).toEqual({
    oldPassword: "old-password",
    newPassword: "new-password",
  });
});
