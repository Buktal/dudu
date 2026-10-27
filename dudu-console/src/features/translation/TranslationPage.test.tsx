import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleClient } from "@/api/client";
import { ConsoleContext } from "@/api/context";
import { deferred, installHttp, success } from "@/test/http";
import { TranslationPage } from "./TranslationPage";

const provider = {
  id: "doubao",
  name: "豆包",
  kind: "model",
  endpoint: "https://example.com/api",
  fields: [],
  unavailableReason: null,
};
const service = (id: string, name: string) => ({
  id,
  name,
  provider: provider.id,
  endpoint: "https://example.com/api",
  values: {},
});
const settings = {
  revision: 1,
  defaultService: "a",
  assistantService: null,
  services: [service("a", "服务甲"), service("b", "服务乙")],
  providers: [provider],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("翻译服务页", () => {
  it("测试连接在飞时其余服务卡入口禁用，完成后恢复且 pending 不串卡", async () => {
    const test = deferred<Response>();
    installHttp((url) => {
      if (url.pathname === "/api/console/translation/test") return test.promise;
      if (url.pathname === "/api/console/translation")
        return Promise.resolve(success(settings));
      return Promise.resolve(success(null));
    });
    render(
      <ConsoleContext value={new ConsoleClient()}>
        <TranslationPage />
      </ConsoleContext>,
    );
    // 服务名在页面合法出现三处（默认服务下拉、侧栏摘要、服务卡标题），按卡片标题定位
    await screen.findByRole("heading", { name: "服务甲" });
    const testButtons = () =>
      screen.getAllByRole("button", { name: "测试连接" });
    expect(testButtons()).toHaveLength(2);

    fireEvent.click(testButtons()[0]);
    // 甲卡进入正在测试：乙卡入口禁用，pending 只归属真实在飞的请求
    expect(
      screen.getByRole("button", { name: "正在测试…" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "测试连接" })).toBeDisabled();

    await act(async () =>
      test.resolve(
        success({
          text: "你好",
          serviceName: "服务甲",
          targetLanguage: "zh",
          revision: 1,
        }),
      ),
    );
    expect(await screen.findByText("连接成功 · 你好")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "正在测试…" })).toBeNull();
    expect(testButtons()).toHaveLength(2);
    expect(testButtons()[0]).toBeEnabled();
    expect(testButtons()[1]).toBeEnabled();
  });

  it("保存成功后 Editor 不重挂：stable 查询不随写后失效重查", async () => {
    const fetcher = installHttp((url, init) => {
      if (url.pathname === "/api/console/translation" && init.method === "PUT")
        return Promise.resolve(success({ ...settings, revision: 2 }));
      if (url.pathname === "/api/console/translation")
        return Promise.resolve(success(settings));
      return Promise.resolve(success(null));
    });
    render(
      <ConsoleContext value={new ConsoleClient()}>
        <TranslationPage />
      </ConsoleContext>,
    );
    await screen.findByRole("heading", { name: "服务甲" });
    const getCalls = () =>
      fetcher.mock.calls.filter(([url, init]) => {
        const target = new URL(String(url), window.location.href);
        return (
          target.pathname === "/api/console/translation" &&
          (init.method ?? "GET") === "GET"
        );
      });
    expect(getCalls()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "保存全部配置" }));
    expect(
      await screen.findByText("AI 与翻译服务配置已保存"),
    ).toBeInTheDocument();
    // 写后失效被 stable 跳过：读取只发生一次，Editor 保持本地草稿继续编辑
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(getCalls()).toHaveLength(1);
    expect(screen.getByText("AI 与翻译服务配置已保存")).toBeInTheDocument();
  });
});
