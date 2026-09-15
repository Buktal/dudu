import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";

import type { ConnectionConfig } from "../api";
import {
  connectionsReducer,
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
  testDingtalkConnection: vi.fn(),
  testDouyinConnection: vi.fn(),
  testFeishuConnection: vi.fn(),
  testKuaishouConnection: vi.fn(),
  testQqConnection: vi.fn(),
  testTaobaoConnection: vi.fn(),
  testWechatMiniConnection: vi.fn(),
  testWechatMpConnection: vi.fn(),
  testWecomConnection: vi.fn(),
  testWeiboConnection: vi.fn(),
  testXiaohongshuConnection: vi.fn(),
}));

import {
  loadConnections,
  saveConnection as saveApi,
  testDingtalkConnection,
  testDouyinConnection,
  testFeishuConnection,
  testKuaishouConnection,
  testQqConnection,
  testTaobaoConnection,
  testWechatMiniConnection,
  testWechatMpConnection,
  testWecomConnection,
  testWeiboConnection,
  testXiaohongshuConnection,
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

const savedDingtalk: ConnectionConfig = {
  channel: "dingtalk",
  url: "http://127.0.0.1:9099/dingtalk",
  system: "http_crypto",
  token: "123456",
  encodingAesKey: "4g5j64qlyl3zvetqxz5jiocdr586fn2zvjpa8zls3ij",
  ownerKey: "suite4xxxxxxxxxxxxxxx",
  appSecret: "this is a secret",
};

const savedQq: ConnectionConfig = {
  channel: "qq",
  url: "http://127.0.0.1:9099/qq",
  appId: "11111111",
  appSecret: "DG5g3B4j9X2KOErG",
};

const savedWeibo: ConnectionConfig = {
  channel: "weibo",
  url: "http://127.0.0.1:9099/weibo",
  appSecret: "xyz123xyz",
};

const savedXiaohongshu: ConnectionConfig = {
  channel: "xiaohongshu",
  url: "http://127.0.0.1:9099/xiaohongshu",
  system: "miniapp",
  token: "mock_token",
  encodingAesKey: "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C",
  appId: "wx_mock_appid",
};

const savedKuaishou: ConnectionConfig = {
  channel: "kuaishou",
  url: "http://127.0.0.1:9099/kuaishou",
  appId: "ks696650570360602063",
  appSecret: "Xgm23lSgws235hlgK",
};

const savedTaobao: ConnectionConfig = {
  channel: "taobao",
  url: "http://127.0.0.1:9099/taobao",
  appKey: "123456",
  appSecret: "taobao_app_secret",
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

  it("钉钉配置走 connections_test_dingtalk（按渠道路由测试命令）", async () => {
    vi.mocked(testDingtalkConnection).mockResolvedValue({
      ok: true,
      message: "check_url 握手成功",
    });
    const store = makeStore();

    await store.dispatch(testConnection(savedDingtalk));

    expect(vi.mocked(testDingtalkConnection)).toHaveBeenCalledWith(
      savedDingtalk,
    );
    expect(vi.mocked(testDouyinConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWecomConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWechatMpConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWechatMiniConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testFeishuConnection)).not.toHaveBeenCalled();
    expect(selectTestState(stateOf(store))).toEqual({
      status: "success",
      message: "check_url 握手成功",
    });
  });

  it("QQ 配置走 connections_test_qq（按渠道路由测试命令）", async () => {
    vi.mocked(testQqConnection).mockResolvedValue({
      ok: true,
      message: "op13 验证回调握手成功",
    });
    const store = makeStore();

    await store.dispatch(testConnection(savedQq));

    expect(vi.mocked(testQqConnection)).toHaveBeenCalledWith(savedQq);
    expect(vi.mocked(testDouyinConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWecomConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWechatMpConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWechatMiniConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testFeishuConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testDingtalkConnection)).not.toHaveBeenCalled();
    expect(selectTestState(stateOf(store))).toEqual({
      status: "success",
      message: "op13 验证回调握手成功",
    });
  });

  it("微博配置走 connections_test_weibo（按渠道路由测试命令）", async () => {
    vi.mocked(testWeiboConnection).mockResolvedValue({
      ok: true,
      message: "echostr 握手成功",
    });
    const store = makeStore();

    await store.dispatch(testConnection(savedWeibo));

    expect(vi.mocked(testWeiboConnection)).toHaveBeenCalledWith(savedWeibo);
    expect(vi.mocked(testDouyinConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWecomConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWechatMpConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWechatMiniConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testFeishuConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testDingtalkConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testQqConnection)).not.toHaveBeenCalled();
    expect(selectTestState(stateOf(store))).toEqual({
      status: "success",
      message: "echostr 握手成功",
    });
  });

  it("小红书配置走 connections_test_xiaohongshu（按渠道路由测试命令）", async () => {
    vi.mocked(testXiaohongshuConnection).mockResolvedValue({
      ok: true,
      message: "echostr 握手成功",
    });
    const store = makeStore();

    await store.dispatch(testConnection(savedXiaohongshu));

    expect(vi.mocked(testXiaohongshuConnection)).toHaveBeenCalledWith(
      savedXiaohongshu,
    );
    expect(vi.mocked(testDouyinConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWecomConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWechatMpConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWechatMiniConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testFeishuConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testDingtalkConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testQqConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWeiboConnection)).not.toHaveBeenCalled();
    expect(selectTestState(stateOf(store))).toEqual({
      status: "success",
      message: "echostr 握手成功",
    });
  });

  it("快手配置走 connections_test_kuaishou（按渠道路由测试命令）", async () => {
    vi.mocked(testKuaishouConnection).mockResolvedValue({
      ok: true,
      message: "TEST 事件握手成功",
    });
    const store = makeStore();

    await store.dispatch(testConnection(savedKuaishou));

    expect(vi.mocked(testKuaishouConnection)).toHaveBeenCalledWith(
      savedKuaishou,
    );
    expect(vi.mocked(testDouyinConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWecomConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWechatMpConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWechatMiniConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testFeishuConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testDingtalkConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testQqConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWeiboConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testXiaohongshuConnection)).not.toHaveBeenCalled();
    expect(selectTestState(stateOf(store))).toEqual({
      status: "success",
      message: "TEST 事件握手成功",
    });
  });

  it("淘宝配置走 connections_test_taobao（按渠道路由测试命令）", async () => {
    vi.mocked(testTaobaoConnection).mockResolvedValue({
      ok: true,
      message: "Verify 验证成功",
    });
    const store = makeStore();

    await store.dispatch(testConnection(savedTaobao));

    expect(vi.mocked(testTaobaoConnection)).toHaveBeenCalledWith(savedTaobao);
    expect(vi.mocked(testDouyinConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWecomConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWechatMpConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWechatMiniConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testFeishuConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testDingtalkConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testQqConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWeiboConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testXiaohongshuConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testKuaishouConnection)).not.toHaveBeenCalled();
    expect(selectTestState(stateOf(store))).toEqual({
      status: "success",
      message: "Verify 验证成功",
    });
  });

  it("未知渠道不落进任何已知分支：不算已配置，测试连接直接拒绝（穷尽分发兜底）", async () => {
    // 运行时兜底防线（类型穷尽守卫在编译期挡新增渠道漏改；
    // 此处验证持久化文件混入怪渠道时 fail-safe，不静默走错协议）
    const rogue = { channel: "telegram" } as unknown as ConnectionConfig;

    expect(isConnectionReady(rogue)).toBe(false);

    const store = makeStore();
    const action = await store.dispatch(testConnection(rogue));

    expect(action.type).toBe(testConnection.rejected.type);
    expect(vi.mocked(testDouyinConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWecomConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWechatMpConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWechatMiniConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testFeishuConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testDingtalkConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testQqConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testWeiboConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testXiaohongshuConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testKuaishouConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(testTaobaoConnection)).not.toHaveBeenCalled();
    expect(selectTestState(stateOf(store)).status).toBe("failed");
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
