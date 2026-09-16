import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  type AlipayConnectionConfig,
  type BilibiliConnectionConfig,
  type ConnectionConfig,
  type DingtalkConnectionConfig,
  type DouyinConnectionConfig,
  type ElemeConnectionConfig,
  type FeishuConnectionConfig,
  type JingdongConnectionConfig,
  type KuaishouConnectionConfig,
  loadConnections,
  type MeituanConnectionConfig,
  type PinduoduoConnectionConfig,
  type QqConnectionConfig,
  saveConnection,
  type TaobaoConnectionConfig,
  type TelegramConnectionConfig,
  testConnectionInvoke,
  type WechatMiniConnectionConfig,
  type WechatMpConnectionConfig,
  type WecomConnectionConfig,
  type WeiboConnectionConfig,
  type WhatsappConnectionConfig,
  type XiaohongshuConnectionConfig,
} from "./api";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

const douyinConfig: DouyinConnectionConfig = {
  channel: "douyin",
  url: "http://127.0.0.1:8080/webhooks/douyin",
  system: "dop",
  clientKey: "mock_client_key",
  clientSecret: "mock_client_secret",
  miniGameToken: "",
  isvToken: "",
  isvKey: "",
};

const wecomConfig: WecomConnectionConfig = {
  channel: "wecom",
  url: "http://127.0.0.1:8080/webhooks/wecom",
  system: "agent",
  corpId: "ww_mock_corp",
  token: "mock_token",
  encodingAesKey: "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C",
  agentId: "1000002",
};

const wechatMpConfig: WechatMpConnectionConfig = {
  channel: "wechat-mp",
  url: "http://127.0.0.1:8080/webhooks/wechat-mp",
  appId: "wx_mock_appid",
  token: "mock_token",
  encodingAesKey: "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C",
  mode: "secure",
};

const wechatMiniConfig: WechatMiniConnectionConfig = {
  channel: "wechat-mini",
  url: "http://127.0.0.1:8080/webhooks/wechat-mini",
  appId: "wx_mock_appid",
  token: "mock_token",
  encodingAesKey: "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C",
  mode: "secure",
  dataFormat: "xml",
};

const feishuConfig: FeishuConnectionConfig = {
  channel: "feishu",
  url: "http://127.0.0.1:8080/webhooks/feishu",
  appId: "cli_mock_appid",
  verificationToken: "mock_verification_token",
  encryptKey: "mock_encrypt_key",
};

const dingtalkConfig: DingtalkConnectionConfig = {
  channel: "dingtalk",
  url: "http://127.0.0.1:8080/webhooks/dingtalk",
  system: "http_crypto",
  token: "mock_token",
  encodingAesKey: "4g5j64qlyl3zvetqxz5jiocdr586fn2zvjpa8zls3ij",
  ownerKey: "suite4xxxxxxxxxxxxxxx",
  appSecret: "mock_app_secret",
};

const qqConfig: QqConnectionConfig = {
  channel: "qq",
  url: "http://127.0.0.1:8080/webhooks/qq",
  appId: "11111111",
  appSecret: "DG5g3B4j9X2KOErG",
};

const weiboConfig: WeiboConnectionConfig = {
  channel: "weibo",
  url: "http://127.0.0.1:8080/webhooks/weibo",
  appSecret: "xyz123xyz",
};

const xiaohongshuConfig: XiaohongshuConnectionConfig = {
  channel: "xiaohongshu",
  url: "http://127.0.0.1:8080/webhooks/xiaohongshu",
  system: "miniapp",
  token: "mock_token",
  encodingAesKey: "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C",
  appId: "wx_mock_appid",
};

const kuaishouConfig: KuaishouConnectionConfig = {
  channel: "kuaishou",
  url: "http://127.0.0.1:8080/webhooks/kuaishou",
  appId: "ks696650570360602063",
  appSecret: "Xgm23lSgws235hlgK",
};

const taobaoConfig: TaobaoConnectionConfig = {
  channel: "taobao",
  url: "http://127.0.0.1:8080/webhooks/taobao",
  appKey: "123456",
  appSecret: "taobao_app_secret",
};

const jingdongConfig: JingdongConnectionConfig = {
  channel: "jingdong",
  url: "http://127.0.0.1:8080/webhooks/jingdong",
  appKey: "yourappkey",
  appSecret: "yourappSecret",
};

const pinduoduoConfig: PinduoduoConnectionConfig = {
  channel: "pinduoduo",
  url: "http://127.0.0.1:8080/webhooks/pinduoduo",
  clientId: "1",
  clientSecret: "testSecret",
};

const meituanConfig: MeituanConnectionConfig = {
  channel: "meituan",
  url: "http://127.0.0.1:8080/webhooks/meituan",
  appId: "1235123121",
  appSecret: "d31ba58fd73c71db697ab5e4946d52d",
};

const elemeConfig: ElemeConnectionConfig = {
  channel: "eleme",
  url: "http://127.0.0.1:8080/webhooks/eleme",
  consumerKey: "7284397484",
  consumerSecret: "4d31ba58fd73c71db697ab5e4946d52d",
};

const alipayConfig: AlipayConnectionConfig = {
  channel: "alipay",
  url: "http://127.0.0.1:8080/webhooks/alipay",
  appId: "2019082200007148",
  appPrivateKey:
    "-----BEGIN PRIVATE KEY-----\nMIIBVAIBADANBgkqhkiG9w0BAQEFAASCAT4wggE6AgEAAkEA0test\n-----END PRIVATE KEY-----",
};

const bilibiliConfig: BilibiliConnectionConfig = {
  channel: "bilibili",
  url: "http://127.0.0.1:8080/webhooks/bilibili",
  clientId: "395c8275dd674f17",
  clientSecret: "bilibili_app_secret",
};

const whatsappConfig: WhatsappConnectionConfig = {
  channel: "whatsapp",
  url: "http://127.0.0.1:8080/webhooks/whatsapp",
  appSecret: "whatsapp_app_secret",
  verifyToken: "meaty-hammer-7",
};

const telegramConfig: TelegramConnectionConfig = {
  channel: "telegram",
  url: "http://127.0.0.1:8080/webhooks/telegram",
  secretToken: "tg-webhook-secret",
};

describe("connections api 契约", () => {
  beforeEach(() => {
    invokeMock.mockClear();
  });

  it("loadConnections 调用 connections_load 命令", async () => {
    invokeMock.mockResolvedValueOnce([douyinConfig]);
    await expect(loadConnections()).resolves.toEqual([douyinConfig]);
    expect(invokeMock).toHaveBeenCalledWith("connections_load");
  });

  it("saveConnection 调用 connections_save 并透传 camelCase 配置", async () => {
    invokeMock.mockResolvedValueOnce([douyinConfig]);
    await saveConnection(douyinConfig);
    expect(invokeMock).toHaveBeenCalledWith("connections_save", {
      config: douyinConfig,
    });
  });

  it.each([
    ["douyin", douyinConfig],
    ["wecom", wecomConfig],
    ["wechat-mp", wechatMpConfig],
    ["wechat-mini", wechatMiniConfig],
    ["feishu", feishuConfig],
    ["dingtalk", dingtalkConfig],
    ["qq", qqConfig],
    ["weibo", weiboConfig],
    ["xiaohongshu", xiaohongshuConfig],
    ["kuaishou", kuaishouConfig],
    ["taobao", taobaoConfig],
    ["jingdong", jingdongConfig],
    ["pinduoduo", pinduoduoConfig],
    ["meituan", meituanConfig],
    ["eleme", elemeConfig],
    ["alipay", alipayConfig],
    ["whatsapp", whatsappConfig],
    ["telegram", telegramConfig],
    ["bilibili", bilibiliConfig],
  ] as const)(
    "%s 渠道走单一 connections_test 命令并透传配置（渠道差异由 Rust 注册表路由）",
    async (_channel, config) => {
      const outcome = { ok: true, message: "探针被接受" };
      invokeMock.mockResolvedValueOnce(outcome);
      await expect(testConnectionInvoke(config)).resolves.toEqual(outcome);
      expect(invokeMock).toHaveBeenCalledWith("connections_test", { config });
    },
  );

  it("未知渠道 fail-safe 拒绝：不触任何 invoke、不静默走错协议", async () => {
    // 运行时兜底防线：样例取注册表外 id（知乎无推送不入表，事实库结论）
    const rogue = { channel: "zhihu" } as unknown as ConnectionConfig;
    await expect(testConnectionInvoke(rogue)).rejects.toThrow("未知渠道");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("saveConnection 的返回列表可同时携带抖音/企微/小红书/公众号/小程序/飞书/钉钉/QQ/微博/快手/淘宝/京东/拼多多/美团/饿了么/B站/支付宝/WhatsApp/Telegram（按 channel 区分形状）", async () => {
    const list: ConnectionConfig[] = [
      douyinConfig,
      wecomConfig,
      xiaohongshuConfig,
      wechatMpConfig,
      wechatMiniConfig,
      feishuConfig,
      dingtalkConfig,
      qqConfig,
      weiboConfig,
      kuaishouConfig,
      taobaoConfig,
      jingdongConfig,
      pinduoduoConfig,
      meituanConfig,
      elemeConfig,
      bilibiliConfig,
      alipayConfig,
      whatsappConfig,
      telegramConfig,
    ];
    invokeMock.mockResolvedValueOnce(list);
    await expect(saveConnection(wechatMpConfig)).resolves.toEqual(list);
    expect(invokeMock).toHaveBeenCalledWith("connections_save", {
      config: wechatMpConfig,
    });
  });
});
