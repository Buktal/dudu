import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminClient } from "@/api/client";
import { AdminContext } from "@/api/context";
import { failure, success } from "@/test/http";
import { CompanyIdField, type IdSelection } from "./CompanyIdField";

function IdForm() {
  const [selection, setSelection] = useState<IdSelection>({
    value: "",
    status: "idle",
  });
  return (
    <CompanyIdField
      selection={selection}
      onChange={setSelection}
      disabled={false}
    />
  );
}

it.each(["100000", "999999"])(
  "接受六位企业 ID 边界 %s，编辑后清除检测结果",
  async (id) => {
    const request = vi
      .fn()
      .mockResolvedValue(success({ companyId: id, available: true }));
    vi.stubGlobal("fetch", request);
    render(
      <AdminContext value={new AdminClient()}>
        <IdForm />
      </AdminContext>,
    );
    fireEvent.change(screen.getByLabelText("企业 ID"), {
      target: { value: id },
    });
    fireEvent.click(screen.getByRole("button", { name: "检测" }));
    expect(await screen.findByText("当前可用")).toBeInTheDocument();
    expect(request.mock.calls[0][0]).toBe(
      `http://127.0.0.1:8080/api/admin/companies/id-availability?companyId=${id}`,
    );
    fireEvent.change(screen.getByLabelText("企业 ID"), {
      target: { value: "234567" },
    });
    expect(screen.queryByText("当前可用")).not.toBeInTheDocument();
  },
);

it.each(["099999", "99999", "1000000", "12345a", "000000"])(
  "拒绝非法企业 ID %s，不发检测请求",
  (id) => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    render(
      <AdminContext value={new AdminClient()}>
        <IdForm />
      </AdminContext>,
    );
    fireEvent.change(screen.getByLabelText("企业 ID"), {
      target: { value: id },
    });
    fireEvent.click(screen.getByRole("button", { name: "检测" }));
    expect(
      screen.getByText("请输入 100000–999999 的六位数字"),
    ).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  },
);

it("区分已占用与生成失败，不将错误显示为可用", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(success({ companyId: "123456", available: false }))
    .mockResolvedValueOnce(failure(13200, "暂未找到可用 ID，请重试"));
  vi.stubGlobal("fetch", request);
  render(
    <AdminContext value={new AdminClient()}>
      <IdForm />
    </AdminContext>,
  );
  fireEvent.change(screen.getByLabelText("企业 ID"), {
    target: { value: "123456" },
  });
  fireEvent.click(screen.getByRole("button", { name: "检测" }));
  expect(
    await screen.findByText("企业 ID 已被占用，请重新选择"),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "随机生成" }));
  expect(
    await screen.findByText("暂未找到可用 ID，请重试"),
  ).toBeInTheDocument();
  expect(screen.queryByText("当前可用")).not.toBeInTheDocument();
});

afterEach(() => vi.unstubAllGlobals());

it("随机结果迟到时不覆盖手输的企业 ID", async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    ),
  );
  function Form() {
    const [selection, setSelection] = useState<IdSelection>({
      value: "",
      status: "idle",
    });
    return (
      <CompanyIdField
        selection={selection}
        onChange={setSelection}
        disabled={false}
      />
    );
  }
  render(
    <AdminContext value={new AdminClient()}>
      <Form />
    </AdminContext>,
  );
  fireEvent.click(screen.getByRole("button", { name: "随机生成" }));
  fireEvent.change(screen.getByLabelText("企业 ID"), {
    target: { value: "987654" },
  });
  resolve(
    Response.json({ code: 0, msg: "成功", data: { companyId: "123456" } }),
  );
  await vi.waitFor(() =>
    expect(screen.getByLabelText("企业 ID")).toHaveValue("987654"),
  );
  expect(screen.queryByText("当前可用")).not.toBeInTheDocument();
});
