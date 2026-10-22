import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";
import type { ChannelId } from "@/lib/channels";

import type { ConnectionConfig } from "../api";
import {
  connectionsReducer,
  selectTestState,
  testConnection,
} from "./connections-slice";

vi.mock("../api", () => ({
  loadConnections: vi.fn(),
  saveConnection: vi.fn(),
  testConnectionInvoke: vi.fn(),
}));

import { testConnectionInvoke } from "../api";

/**
 * 测试连接 thunk 的分发与状态落位单测：19 渠道逐个走 thunk，断言分发器恰好
 * 收到该渠道配置且状态落 testsByChannel（自 connections-slice.test.ts 按主题
 * 拆出，code-review 退件）。渠道 → Rust 命令的路由契约本身由
 * ../api.test.ts 的分发器单测覆盖；此处分发器已 mock，只验 slice 语义。
 */

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

const savedJingdong: ConnectionConfig = {
  channel: "jingdong",
  url: "http://127.0.0.1:9099/jingdong",
  appKey: "yourappkey",
  appSecret: "yourappSecret",
};

const savedPinduoduo: ConnectionConfig = {
  channel: "pinduoduo",
  url: "http://127.0.0.1:9099/pinduoduo",
  clientId: "1",
  clientSecret: "testSecret",
};

const savedMeituan: ConnectionConfig = {
  channel: "meituan",
  url: "http://127.0.0.1:9099/meituan",
  appId: "1235123121",
  appSecret: "d31ba58fd73c71db697ab5e4946d52d",
};

const savedEleme: ConnectionConfig = {
  channel: "eleme",
  url: "http://127.0.0.1:9099/eleme",
  consumerKey: "7284397484",
  consumerSecret: "4d31ba58fd73c71db697ab5e4946d52d",
};

const savedAlipay: ConnectionConfig = {
  channel: "alipay",
  url: "http://127.0.0.1:9099/alipay",
  appId: "2019082200007148",
  appPrivateKey: "MIIBVAIBADANBgkqhkiG9w0BAQEFAASCAT4wggE6AgEAAkEA0test",
};

const savedWhatsapp: ConnectionConfig = {
  channel: "whatsapp",
  url: "http://127.0.0.1:9099/whatsapp",
  appSecret: "whatsapp_app_secret",
  verifyToken: "meaty-hammer-7",
};

const savedTelegram: ConnectionConfig = {
  channel: "telegram",
  url: "http://127.0.0.1:9099/telegram",
  secretToken: "tg-webhook-secret",
};

const savedBilibili: ConnectionConfig = {
  channel: "bilibili",
  url: "http://127.0.0.1:9099/bilibili",
  clientId: "395c8275dd674f17",
  clientSecret: "bilibili_app_secret",
};

const SAVED_BY_CHANNEL: ConnectionConfig[] = [
  savedDouyin,
  savedWecom,
  savedWechatMp,
  savedWechatMini,
  savedFeishu,
  savedDingtalk,
  savedQq,
  savedWeibo,
  savedXiaohongshu,
  savedKuaishou,
  savedTaobao,
  savedJingdong,
  savedPinduoduo,
  savedMeituan,
  savedEleme,
  savedAlipay,
  savedWhatsapp,
  savedTelegram,
  savedBilibili,
];

function makeStore() {
  return configureStore({ reducer: { connections: connectionsReducer } });
}

describe("testConnection 按渠道分发", () => {
  it.each(SAVED_BY_CHANNEL)(
    "$channel 配置经 thunk 调用分发器并落渠道测试状态",
    async (config) => {
      vi.mocked(testConnectionInvoke).mockResolvedValue({
        ok: true,
        message: "分发器已接受",
      });
      const store = makeStore();

      await store.dispatch(testConnection(config));

      expect(vi.mocked(testConnectionInvoke)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(testConnectionInvoke)).toHaveBeenCalledWith(config);
      expect(
        selectTestState(store.getState().connections, config.channel),
      ).toEqual({
        status: "success",
        message: "分发器已接受",
      });
    },
  );

  it("分发器 reject 时 thunk rejected 且测试状态 failed（未知渠道由 api 层 fail-safe 拒绝）", async () => {
    // 运行时兜底防线：样例取注册表外 id（知乎无推送不入表，事实库结论）；
    // 拒绝本体在 testConnectionInvoke（见 ../api.test.ts），此处验 slice 落态
    const rogue = { channel: "zhihu" } as unknown as ConnectionConfig;
    vi.mocked(testConnectionInvoke).mockRejectedValueOnce(
      new Error("未知渠道，无法测试连接：zhihu"),
    );
    const store = makeStore();

    const action = await store.dispatch(testConnection(rogue));

    expect(action.type).toBe(testConnection.rejected.type);
    // 状态只落渠道： rogue 渠道键原样写入（未知渠道无独立全局态）
    expect(
      selectTestState(store.getState().connections, rogue.channel as ChannelId)
        .status,
    ).toBe("failed");
  });
});
