import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleClient } from "@/api/client";
import { ConsoleContext } from "@/api/context";
import { AccountEditor } from "./AccountEditor";
import type { AccountDetail, ChannelDefinition } from "./api";

const definition: ChannelDefinition = {
  channel: "wechat-mp",
  name: "微信公众号",
  available: true,
  restriction: "仅支持明文回调",
  notes: [],
  fields: [
    {
      key: "token",
      label: "回调 token",
      secret: true,
      requiredForReceive: true,
      requiredForSend: false,
      immutableOnceConfigured: false,
      control: "password",
    },
    {
      key: "appId",
      label: "应用 ID",
      secret: false,
      requiredForReceive: false,
      requiredForSend: true,
      immutableOnceConfigured: true,
      control: "text",
    },
    {
      key: "appSecret",
      label: "应用密钥",
      secret: true,
      requiredForReceive: false,
      requiredForSend: true,
      immutableOnceConfigured: false,
      control: "password",
    },
  ],
};
const detail: AccountDetail = {
  companyChannelId: "1",
  groupId: "2",
  groupName: "接待组",
  channel: "wechat-mp",
  accountName: "服务号",
  receiveConfigured: true,
  sendConfigured: true,
  missingReceiveFields: [],
  missingSendFields: [],
  createTime: "2026-10-20 00:00:00",
  updateTime: "2026-10-20 00:00:00",
  callbackUrl: "https://example.com/api/channels/1/callback",
  fields: { appId: "app-original" },
  configuredSecretFields: ["token", "appSecret"],
  notes: [],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function renderEditor(existing?: AccountDetail, catalog = [definition]) {
  const saved = vi.fn();
  render(
    <ConsoleContext.Provider value={new ConsoleClient()}>
      <AccountEditor
        definitions={catalog}
        groups={[{ groupId: "2", groupName: "接待组" }]}
        detail={existing}
        initialGroup="2"
        onClose={vi.fn()}
        onSaved={saved}
        onUnavailable={vi.fn()}
      />
    </ConsoleContext.Provider>,
  );
  return saved;
}
describe("渠道账号操作", () => {
  it("维护时秘密留空保持，固定应用身份不可改，显式清除只写清除指令", async () => {
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ code: 0, msg: "", data: detail })),
    );
    vi.stubGlobal("fetch", fetcher);
    renderEditor(detail);
    expect(screen.getByLabelText("应用 ID · 发送所需")).toBeDisabled();
    expect(screen.getByLabelText("回调 token · 接收必需")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "清除 应用密钥" }));
    fireEvent.click(screen.getByRole("button", { name: "保存参数" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string)).toEqual({
      accountName: "服务号",
      credentialChanges: { set: {}, clear: ["appSecret"] },
    });
  });
  it("创建只要求接收配置，发送可稍后补齐，成功清理秘密输入", async () => {
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ code: 0, msg: "", data: detail })),
    );
    vi.stubGlobal("fetch", fetcher);
    const saved = renderEditor();
    fireEvent.change(screen.getByLabelText("渠道"), {
      target: { value: "wechat-mp" },
    });
    fireEvent.change(screen.getByLabelText("账号名称"), {
      target: { value: " 接待号 " },
    });
    fireEvent.change(screen.getByLabelText("回调 token · 接收必需"), {
      target: { value: "receive-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存参数" }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string)).toEqual({
      accountName: "接待号",
      groupId: "2",
      channel: "wechat-mp",
      fields: { token: "receive-secret" },
    });
    expect(screen.getByLabelText("回调 token · 接收必需")).toHaveValue("");
  });
});

it("多行公钥保留 PEM 原文，不裁剪首尾换行", async () => {
  const pem =
    "\n-----BEGIN PUBLIC KEY-----\nPUBLIC\n-----END PUBLIC KEY-----\n";
  const fetcher = vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ code: 0, msg: "", data: detail })),
  );
  vi.stubGlobal("fetch", fetcher);
  renderEditor(undefined, [
    {
      ...definition,
      fields: [
        {
          key: "alipayPublicKey",
          label: "支付宝公钥",
          secret: false,
          requiredForReceive: true,
          requiredForSend: true,
          immutableOnceConfigured: false,
          control: "textarea",
        },
      ],
    },
  ]);
  fireEvent.change(screen.getByLabelText("渠道"), {
    target: { value: "wechat-mp" },
  });
  fireEvent.change(screen.getByLabelText("账号名称"), {
    target: { value: "生活号" },
  });
  fireEvent.change(screen.getByLabelText("支付宝公钥 · 接收必需"), {
    target: { value: pem },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存参数" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalled());
  expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string).fields).toEqual(
    { alipayPublicKey: pem },
  );
});
