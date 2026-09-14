import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";

import type { ConnectionConfig } from "../api";
import {
  connectionsReducer,
  defaultFeishuConnection,
  defaultWechatMiniConnection,
  defaultWechatMpConnection,
  defaultWecomConnection,
  fetchConnections,
  initialConnectionsState,
  isConnectionReady,
  saveConnection,
  selectConnection,
  selectTestState,
  setConnectionChannel,
  setConnectionDraft,
  testConnection,
} from "./connections-slice";

vi.mock("../api", () => ({
  loadConnections: vi.fn(),
  saveConnection: vi.fn(),
  testDouyinConnection: vi.fn(),
  testFeishuConnection: vi.fn(),
  testWechatMiniConnection: vi.fn(),
  testWechatMpConnection: vi.fn(),
  testWecomConnection: vi.fn(),
}));

import {
  loadConnections,
  saveConnection as saveApi,
  testDouyinConnection,
  testFeishuConnection,
  testWechatMiniConnection,
  testWechatMpConnection,
  testWecomConnection,
} from "../api";

const savedDouyin: ConnectionConfig = {
  channel: "douyin",
  url: "http://127.0.0.1:9099/hook",
  system: "dop",
  clientKey: "tt_key",
  clientSecret: "tt_secret",
  miniGameToken: "",
  isvToken: "",
  isvKey: "",
};

const savedWecom: ConnectionConfig = {
  channel: "wecom",
  url: "http://127.0.0.1:9099/wecom",
  system: "agent",
  corpId: "ww_mock_corp",
  token: "QDG6eK",
  encodingAesKey: "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C",
  agentId: "1000002",
};

const savedWechatMp: ConnectionConfig = {
  channel: "wechat-mp",
  url: "http://127.0.0.1:9099/wechat-mp",
  appId: "wx_mock_appid",
  token: "AAAAA",
  encodingAesKey: "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C",
  mode: "secure",
};

const savedWechatMini: ConnectionConfig = {
  channel: "wechat-mini",
  url: "http://127.0.0.1:9099/wechat-mini",
  appId: "wx_mock_appid",
  token: "AAAAA",
  encodingAesKey: "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C",
  mode: "secure",
  dataFormat: "xml",
};

const savedFeishu: ConnectionConfig = {
  channel: "feishu",
  url: "http://127.0.0.1:9099/feishu",
  appId: "cli_mock_appid",
  verificationToken: "rvaYgkND1GOiu5MM0E1rncYC6PLtF7JV",
  encryptKey: "test key",
};

function makeStore() {
  return configureStore({ reducer: { connections: connectionsReducer } });
}

type Store = ReturnType<typeof makeStore>;
const stateOf = (store: Store) => store.getState().connections;

describe("connections slice", () => {
  it("初始自带抖音默认连接，测试状态为 idle", () => {
    expect(selectConnection(initialConnectionsState, "douyin")?.url).toBe(
      "http://127.0.0.1:8080/webhooks/douyin",
    );
    expect(selectTestState(initialConnectionsState).status).toBe("idle");
    expect(initialConnectionsState.loaded).toBe(false);
  });

  it("fetchConnections 成功后用持久化数据覆盖并标记 loaded", async () => {
    vi.mocked(loadConnections).mockResolvedValue([savedDouyin]);
    const store = makeStore();

    await store.dispatch(fetchConnections());

    expect(stateOf(store).loaded).toBe(true);
    expect(selectConnection(stateOf(store), "douyin")).toEqual(savedDouyin);
  });

  it("fetchConnections 携带抖音与企微时两条按 channel 各自落位", async () => {
    vi.mocked(loadConnections).mockResolvedValue([savedDouyin, savedWecom]);
    const store = makeStore();

    await store.dispatch(fetchConnections());

    expect(selectConnection(stateOf(store), "douyin")).toEqual(savedDouyin);
    expect(selectConnection(stateOf(store), "wecom")).toEqual(savedWecom);
  });

  it("saveConnection 成功后按 channel 覆盖保存", async () => {
    vi.mocked(saveApi).mockResolvedValue([savedDouyin]);
    const store = makeStore();

    await store.dispatch(saveConnection(savedDouyin));

    expect(vi.mocked(saveApi)).toHaveBeenCalledWith(savedDouyin);
    expect(selectConnection(stateOf(store), "douyin")).toEqual(savedDouyin);
  });

  it("saveConnection 保存企微后列表同时保留两条渠道", async () => {
    vi.mocked(saveApi).mockResolvedValue([savedDouyin, savedWecom]);
    const store = makeStore();

    await store.dispatch(saveConnection(savedWecom));

    expect(vi.mocked(saveApi)).toHaveBeenCalledWith(savedWecom);
    expect(selectConnection(stateOf(store), "wecom")).toEqual(savedWecom);
    expect(selectConnection(stateOf(store), "douyin")).toEqual(savedDouyin);
  });

  it("初始状态自带企微默认占位连接（url 预填、自建应用通道、凭据留空）", () => {
    expect(defaultWecomConnection.channel).toBe("wecom");
    expect(defaultWecomConnection.url).toBe(
      "http://127.0.0.1:8080/webhooks/wecom",
    );
    expect(defaultWecomConnection.system).toBe("agent");
    expect(
      isConnectionReady(selectConnection(initialConnectionsState, "wecom")),
    ).toBe(false);
  });

  it("测试连接状态流转 idle → testing → success/failed 并记录原因", async () => {
    const store = makeStore();
    vi.mocked(testDouyinConnection).mockResolvedValue({
      ok: true,
      message: "challenge 回显一致",
    });

    const pending = store.dispatch(testConnection(savedDouyin));
    expect(selectTestState(stateOf(store)).status).toBe("testing");
    await pending;

    expect(selectTestState(stateOf(store))).toEqual({
      status: "success",
      message: "challenge 回显一致",
    });

    vi.mocked(testDouyinConnection).mockResolvedValue({
      ok: false,
      message: "响应 challenge 不一致",
    });
    await store.dispatch(testConnection(savedDouyin));

    expect(selectTestState(stateOf(store))).toEqual({
      status: "failed",
      message: "响应 challenge 不一致",
    });
  });

  it("测试连接 IPC 失败时进入 failed 并带上错误信息", async () => {
    vi.mocked(testDouyinConnection).mockRejectedValue(new Error("后端不可用"));
    const store = makeStore();

    await store.dispatch(testConnection(savedDouyin));

    const test = selectTestState(stateOf(store));
    expect(test.status).toBe("failed");
    expect(test.message).toContain("后端不可用");
  });

  it("企微配置走 connections_test_wecom（按渠道路由测试命令）", async () => {
    vi.mocked(testWecomConnection).mockResolvedValue({
      ok: true,
      message: "echostr 握手成功",
    });
    const store = makeStore();

    await store.dispatch(testConnection(savedWecom));

    expect(vi.mocked(testWecomConnection)).toHaveBeenCalledWith(savedWecom);
    expect(vi.mocked(testDouyinConnection)).not.toHaveBeenCalled();
    expect(selectTestState(stateOf(store))).toEqual({
      status: "success",
      message: "echostr 握手成功",
    });
  });

  it("公众号配置走 connections_test_wechat_mp（按渠道路由测试命令）", async () => {
    vi.mocked(testWechatMpConnection).mockResolvedValue({
      ok: true,
      message: "echostr 握手成功",
    });
    const store = makeStore();

    await store.dispatch(testConnection(savedWechatMp));

    expect(vi.mocked(testWechatMpConnection)).toHaveBeenCalledWith(
      savedWechatMp,
    );
    expect(vi.mocked(testDouyinConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWecomConnection)).not.toHaveBeenCalled();
    expect(selectTestState(stateOf(store))).toEqual({
      status: "success",
      message: "echostr 握手成功",
    });
  });

  it("小程序配置走 connections_test_wechat_mini（按渠道路由测试命令）", async () => {
    vi.mocked(testWechatMiniConnection).mockResolvedValue({
      ok: true,
      message: "echostr 握手成功",
    });
    const store = makeStore();

    await store.dispatch(testConnection(savedWechatMini));

    expect(vi.mocked(testWechatMiniConnection)).toHaveBeenCalledWith(
      savedWechatMini,
    );
    expect(vi.mocked(testDouyinConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWecomConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWechatMpConnection)).not.toHaveBeenCalled();
    expect(selectTestState(stateOf(store))).toEqual({
      status: "success",
      message: "echostr 握手成功",
    });
  });

  it("飞书配置走 connections_test_feishu（按渠道路由测试命令）", async () => {
    vi.mocked(testFeishuConnection).mockResolvedValue({
      ok: true,
      message: "url_verification 握手成功",
    });
    const store = makeStore();

    await store.dispatch(testConnection(savedFeishu));

    expect(vi.mocked(testFeishuConnection)).toHaveBeenCalledWith(savedFeishu);
    expect(vi.mocked(testDouyinConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWecomConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWechatMpConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWechatMiniConnection)).not.toHaveBeenCalled();
    expect(selectTestState(stateOf(store))).toEqual({
      status: "success",
      message: "url_verification 握手成功",
    });
  });

  it("未知渠道不落进任何已知分支：不算已配置，测试连接直接拒绝（穷尽分发兜底）", async () => {
    // 运行时兜底防线（类型穷尽守卫在编译期挡新增渠道漏改；
    // 此处验证持久化文件混入怪渠道时 fail-safe，不静默走错协议）
    const rogue = { channel: "dingtalk" } as unknown as ConnectionConfig;

    expect(isConnectionReady(rogue)).toBe(false);

    const store = makeStore();
    const action = await store.dispatch(testConnection(rogue));

    expect(action.type).toBe(testConnection.rejected.type);
    expect(vi.mocked(testDouyinConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWecomConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWechatMpConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWechatMiniConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testFeishuConnection)).not.toHaveBeenCalled();
    expect(selectTestState(stateOf(store)).status).toBe("failed");
  });
});

describe("isConnectionReady（直发前置的内容判定）", () => {
  it("url 与 clientSecret 齐全才算已配置（clientKey 可空）", () => {
    expect(isConnectionReady(savedDouyin)).toBe(true);
    expect(isConnectionReady({ ...savedDouyin, clientKey: "" })).toBe(true);
  });

  it("缺 url 或缺 clientSecret 都不算已配置", () => {
    expect(isConnectionReady({ ...savedDouyin, url: "" })).toBe(false);
    expect(isConnectionReady({ ...savedDouyin, url: "   " })).toBe(false);
    expect(isConnectionReady({ ...savedDouyin, clientSecret: "" })).toBe(false);
  });

  it("小游戏按 miniGameToken 判定，dop 凭据不参与", () => {
    const miniGame = {
      ...savedDouyin,
      system: "mini_game" as const,
      clientSecret: "",
      miniGameToken: "mg_token",
    };
    expect(isConnectionReady(miniGame)).toBe(true);
    expect(isConnectionReady({ ...miniGame, miniGameToken: "" })).toBe(false);
  });

  it("服务商按 isvToken 判定（isvKey 暂不参与验签，可空）", () => {
    const isv = {
      ...savedDouyin,
      system: "isv" as const,
      clientSecret: "",
      isvToken: "tk",
      isvKey: "",
    };
    expect(isConnectionReady(isv)).toBe(true);
    expect(isConnectionReady({ ...isv, isvToken: "" })).toBe(false);
  });

  it("生活服务与 dop 同按 clientSecret 判定", () => {
    const life = { ...savedDouyin, system: "life_service" as const };
    expect(isConnectionReady(life)).toBe(true);
    expect(isConnectionReady({ ...life, clientSecret: "" })).toBe(false);
  });

  it("无条目（undefined）不算已配置；初始默认占位连接凭据为空，也不算", () => {
    expect(isConnectionReady(undefined)).toBe(false);
    expect(
      isConnectionReady(selectConnection(initialConnectionsState, "douyin")),
    ).toBe(false);
  });
});

describe("isConnectionReady（企微按通道核加密必填集）", () => {
  it("自建应用：url/token/encodingAesKey/corpId 齐全才算已配置（agentId 可空）", () => {
    expect(isConnectionReady(savedWecom)).toBe(true);
    expect(isConnectionReady({ ...savedWecom, agentId: "" })).toBe(true);
  });

  it("缺 url/token/encodingAesKey/corpId 任一都不算已配置", () => {
    expect(isConnectionReady({ ...savedWecom, url: "" })).toBe(false);
    expect(isConnectionReady({ ...savedWecom, token: "" })).toBe(false);
    expect(isConnectionReady({ ...savedWecom, encodingAesKey: "" })).toBe(
      false,
    );
    expect(isConnectionReady({ ...savedWecom, corpId: "" })).toBe(false);
  });

  it("智能机器人：加密 receiveid 恒为空串，corpId 不参与必填集", () => {
    const aibot = { ...savedWecom, system: "aibot" as const };
    expect(isConnectionReady(aibot)).toBe(true);
    expect(isConnectionReady({ ...aibot, corpId: "" })).toBe(true);
    expect(isConnectionReady({ ...aibot, agentId: "" })).toBe(true);
    expect(isConnectionReady({ ...aibot, token: "" })).toBe(false);
    expect(isConnectionReady({ ...aibot, encodingAesKey: "" })).toBe(false);
  });

  it("初始企微占位连接（凭据全空）不算已配置", () => {
    expect(
      isConnectionReady(selectConnection(initialConnectionsState, "wecom")),
    ).toBe(false);
  });
});

describe("isConnectionReady（公众号按消息加解密方式核必填集）", () => {
  it("安全模式：url/appId/token/encodingAesKey 齐全才算已配置", () => {
    expect(isConnectionReady(savedWechatMp)).toBe(true);
    expect(isConnectionReady({ ...savedWechatMp, url: "" })).toBe(false);
    expect(isConnectionReady({ ...savedWechatMp, appId: "" })).toBe(false);
    expect(isConnectionReady({ ...savedWechatMp, token: "" })).toBe(false);
    expect(isConnectionReady({ ...savedWechatMp, encodingAesKey: "" })).toBe(
      false,
    );
  });

  it("明文模式无需 EncodingAESKey（官方默认项，AESKey 可空）", () => {
    const plain = {
      ...savedWechatMp,
      mode: "plain" as const,
      encodingAesKey: "",
    };
    expect(isConnectionReady(plain)).toBe(true);
  });

  it("兼容模式与安全模式同按 AESKey 必填判定", () => {
    const compatible = {
      ...savedWechatMp,
      mode: "compatible" as const,
      encodingAesKey: "",
    };
    expect(isConnectionReady(compatible)).toBe(false);
    expect(
      isConnectionReady({ ...compatible, encodingAesKey: "A".repeat(43) }),
    ).toBe(true);
  });

  it("初始公众号占位连接（凭据全空）不算已配置", () => {
    expect(defaultWechatMpConnection.mode).toBe("plain");
    expect(
      isConnectionReady(selectConnection(initialConnectionsState, "wechat-mp")),
    ).toBe(false);
  });
});

describe("isConnectionReady（小程序按消息加解密方式核必填集）", () => {
  it("安全模式：url/appId/token/encodingAesKey 齐全才算已配置（dataFormat 不参与）", () => {
    expect(isConnectionReady(savedWechatMini)).toBe(true);
    expect(isConnectionReady({ ...savedWechatMini, url: "" })).toBe(false);
    expect(isConnectionReady({ ...savedWechatMini, appId: "" })).toBe(false);
    expect(isConnectionReady({ ...savedWechatMini, token: "" })).toBe(false);
    expect(isConnectionReady({ ...savedWechatMini, encodingAesKey: "" })).toBe(
      false,
    );
    expect(isConnectionReady({ ...savedWechatMini, dataFormat: "json" })).toBe(
      true,
    );
  });

  it("明文模式无需 EncodingAESKey（AESKey 可空）", () => {
    const plain = {
      ...savedWechatMini,
      mode: "plain" as const,
      encodingAesKey: "",
    };
    expect(isConnectionReady(plain)).toBe(true);
  });

  it("兼容模式与安全模式同按 AESKey 必填判定", () => {
    const compatible = {
      ...savedWechatMini,
      mode: "compatible" as const,
      encodingAesKey: "",
    };
    expect(isConnectionReady(compatible)).toBe(false);
    expect(
      isConnectionReady({ ...compatible, encodingAesKey: "A".repeat(43) }),
    ).toBe(true);
  });

  it("初始小程序占位连接（凭据全空、XML 格式起步）不算已配置", () => {
    expect(defaultWechatMiniConnection.channel).toBe("wechat-mini");
    expect(defaultWechatMiniConnection.mode).toBe("plain");
    expect(defaultWechatMiniConnection.dataFormat).toBe("xml");
    expect(
      isConnectionReady(
        selectConnection(initialConnectionsState, "wechat-mini"),
      ),
    ).toBe(false);
  });
});

describe("isConnectionReady（飞书核必填集）", () => {
  it("url/verificationToken 齐全才算已配置（appId/encryptKey 不参与必填集）", () => {
    expect(isConnectionReady(savedFeishu)).toBe(true);
    expect(isConnectionReady({ ...savedFeishu, appId: "" })).toBe(true);
    expect(isConnectionReady({ ...savedFeishu, encryptKey: "" })).toBe(true);
  });

  it("缺 url 或缺 verificationToken 都不算已配置", () => {
    expect(isConnectionReady({ ...savedFeishu, url: "" })).toBe(false);
    expect(isConnectionReady({ ...savedFeishu, url: "  " })).toBe(false);
    expect(isConnectionReady({ ...savedFeishu, verificationToken: "" })).toBe(
      false,
    );
  });

  it("初始飞书占位连接（凭据全空、明文直发起步）不算已配置", () => {
    expect(defaultFeishuConnection.channel).toBe("feishu");
    expect(defaultFeishuConnection.url).toBe(
      "http://127.0.0.1:8080/webhooks/feishu",
    );
    expect(defaultFeishuConnection.encryptKey).toBe("");
    expect(
      isConnectionReady(selectConnection(initialConnectionsState, "feishu")),
    ).toBe(false);
  });
});

describe("连接草稿回归", () => {
  it("切换平台与重新载入不会覆盖草稿，旧保存回包也不会覆盖继续编辑", async () => {
    const store = makeStore();
    const submitted = {
      ...savedDouyin,
      url: "http://localhost:9090/submitted",
    };
    store.dispatch(setConnectionDraft(submitted));
    store.dispatch(setConnectionChannel("wecom"));
    store.dispatch(
      fetchConnections.fulfilled([savedDouyin, savedWecom], "refetch"),
    );
    expect(stateOf(store).drafts?.douyin).toEqual(submitted);
    let finish!: (configs: ConnectionConfig[]) => void;
    vi.mocked(saveApi).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = store.dispatch(saveConnection(submitted));
    const edited = { ...submitted, url: "http://localhost:9090/later" };
    store.dispatch(setConnectionDraft(edited));
    finish([submitted, savedWecom]);
    await pending;
    expect(stateOf(store).drafts?.douyin).toEqual(edited);
    expect(stateOf(store).items.douyin).toEqual(submitted);
  });
});
