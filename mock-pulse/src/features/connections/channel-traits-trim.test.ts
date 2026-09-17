import { describe, expect, it } from "vitest";

import type { ConnectionConfig } from "./api";
import { channelTraits, isConnectionReady } from "./channel-traits";

/**
 * trim 统一的行钉（C1 意图行为变更）：url 与全部凭据共用 hasText（trim 后非空），
 * 空白串一律视为未填。收敛前 douyin/wecom/wechat-mp/wechat-mini 的必填集用
 * `!== ""`（空白串曾算已配置），其余用 trim——现统一为 trim，空白凭据改判
 * 未配置是唯一的意图行为变更；包围空白（`  secret  `）仍算已配置。
 * 另钉 feishu 双重 url 检查的收敛：credentialReady 不再复核 url（公共前置唯一）。
 */

type TrimCase = {
  name: string;
  config: ConnectionConfig;
  requiredKeys: string[];
};

const URL = "http://127.0.0.1:9099/hook";
const AES = "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C";

const CASES: TrimCase[] = [
  {
    name: "douyin/dop",
    config: {
      channel: "douyin",
      url: URL,
      system: "dop",
      clientKey: "ck",
      clientSecret: "cs",
      miniGameToken: "",
      isvToken: "",
      isvKey: "",
    },
    requiredKeys: ["clientSecret"],
  },
  {
    name: "douyin/life_service",
    config: {
      channel: "douyin",
      url: URL,
      system: "life_service",
      clientKey: "ck",
      clientSecret: "cs",
      miniGameToken: "",
      isvToken: "",
      isvKey: "",
    },
    requiredKeys: ["clientSecret"],
  },
  {
    name: "douyin/mini_game",
    config: {
      channel: "douyin",
      url: URL,
      system: "mini_game",
      clientKey: "ck",
      clientSecret: "",
      miniGameToken: "mg_token",
      isvToken: "",
      isvKey: "",
    },
    requiredKeys: ["miniGameToken"],
  },
  {
    name: "douyin/isv",
    config: {
      channel: "douyin",
      url: URL,
      system: "isv",
      clientKey: "",
      clientSecret: "",
      miniGameToken: "",
      isvToken: "tk",
      isvKey: "",
    },
    requiredKeys: ["isvToken"],
  },
  {
    name: "wecom/agent",
    config: {
      channel: "wecom",
      url: URL,
      system: "agent",
      corpId: "corp",
      token: "token",
      encodingAesKey: AES,
      agentId: "",
    },
    requiredKeys: ["corpId", "token", "encodingAesKey"],
  },
  {
    name: "wecom/aibot",
    config: {
      channel: "wecom",
      url: URL,
      system: "aibot",
      corpId: "",
      token: "token",
      encodingAesKey: AES,
      agentId: "",
    },
    requiredKeys: ["token", "encodingAesKey"],
  },
  {
    name: "wechat-mp/plain",
    config: {
      channel: "wechat-mp",
      url: URL,
      appId: "wx_appid",
      token: "token",
      encodingAesKey: "",
      mode: "plain",
    },
    requiredKeys: ["appId", "token"],
  },
  {
    name: "wechat-mp/secure",
    config: {
      channel: "wechat-mp",
      url: URL,
      appId: "wx_appid",
      token: "token",
      encodingAesKey: AES,
      mode: "secure",
    },
    requiredKeys: ["appId", "token", "encodingAesKey"],
  },
  {
    name: "wechat-mini/plain",
    config: {
      channel: "wechat-mini",
      url: URL,
      appId: "wx_appid",
      token: "token",
      encodingAesKey: "",
      mode: "plain",
      dataFormat: "xml",
    },
    requiredKeys: ["appId", "token"],
  },
  {
    name: "wechat-mini/secure",
    config: {
      channel: "wechat-mini",
      url: URL,
      appId: "wx_appid",
      token: "token",
      encodingAesKey: AES,
      mode: "secure",
      dataFormat: "xml",
    },
    requiredKeys: ["appId", "token", "encodingAesKey"],
  },
  {
    name: "feishu",
    config: {
      channel: "feishu",
      url: URL,
      appId: "cli_mock_appid",
      verificationToken: "vt",
      encryptKey: "",
    },
    requiredKeys: ["verificationToken"],
  },
  {
    name: "dingtalk/http_crypto",
    config: {
      channel: "dingtalk",
      url: URL,
      system: "http_crypto",
      token: "123456",
      encodingAesKey: "4g5j64qlyl3zvetqxz5jiocdr586fn2zvjpa8zls3ij",
      ownerKey: "suite4xxxxxxxxxxxxxxx",
      appSecret: "",
    },
    requiredKeys: ["token", "encodingAesKey", "ownerKey"],
  },
  {
    name: "dingtalk/bot",
    config: {
      channel: "dingtalk",
      url: URL,
      system: "bot",
      token: "",
      encodingAesKey: "",
      ownerKey: "",
      appSecret: "secret",
    },
    requiredKeys: ["appSecret"],
  },
  {
    name: "qq",
    config: {
      channel: "qq",
      url: URL,
      appId: "11111111",
      appSecret: "DG5g3B4j9X2KOErG",
    },
    requiredKeys: ["appSecret"],
  },
  {
    name: "weibo",
    config: {
      channel: "weibo",
      url: URL,
      appSecret: "xyz123xyz",
    },
    requiredKeys: ["appSecret"],
  },
  {
    name: "xiaohongshu/miniapp",
    config: {
      channel: "xiaohongshu",
      url: URL,
      system: "miniapp",
      token: "token",
      encodingAesKey: AES,
      appId: "wx_appid",
    },
    requiredKeys: ["token", "encodingAesKey", "appId"],
  },
  {
    name: "xiaohongshu/ark",
    config: {
      channel: "xiaohongshu",
      url: URL,
      system: "ark",
      token: "",
      encodingAesKey: "",
      appId: "",
    },
    requiredKeys: [],
  },
  {
    name: "kuaishou",
    config: {
      channel: "kuaishou",
      url: URL,
      appId: "ks696650570360602063",
      appSecret: "Xgm23lSgws235hlgK",
    },
    requiredKeys: ["appId", "appSecret"],
  },
  {
    name: "taobao",
    config: {
      channel: "taobao",
      url: URL,
      appKey: "123456",
      appSecret: "taobao_app_secret",
    },
    requiredKeys: ["appKey", "appSecret"],
  },
  {
    name: "jingdong",
    config: {
      channel: "jingdong",
      url: URL,
      appKey: "yourappkey",
      appSecret: "yourappSecret",
    },
    requiredKeys: ["appKey", "appSecret"],
  },
  {
    name: "pinduoduo",
    config: {
      channel: "pinduoduo",
      url: URL,
      clientId: "1",
      clientSecret: "testSecret",
    },
    requiredKeys: ["clientId", "clientSecret"],
  },
  {
    name: "meituan",
    config: {
      channel: "meituan",
      url: URL,
      appId: "1235123121",
      appSecret: "d31ba58fd73c71db697ab5e4946d52d",
    },
    requiredKeys: ["appId", "appSecret"],
  },
  {
    name: "eleme",
    config: {
      channel: "eleme",
      url: URL,
      consumerKey: "7284397484",
      consumerSecret: "4d31ba58fd73c71db697ab5e4946d52d",
    },
    requiredKeys: ["consumerKey", "consumerSecret"],
  },
  {
    name: "alipay",
    config: {
      channel: "alipay",
      url: URL,
      appId: "2019082200007148",
      appPrivateKey: "MIIBVAIBADANBgkqhkiG9w0BAQEFAASCAT4wggE6AgEAAkEA0test",
    },
    requiredKeys: ["appPrivateKey"],
  },
  {
    name: "whatsapp",
    config: {
      channel: "whatsapp",
      url: URL,
      appSecret: "whatsapp_app_secret",
      verifyToken: "meaty-hammer-7",
    },
    requiredKeys: ["appSecret", "verifyToken"],
  },
  {
    name: "telegram",
    config: {
      channel: "telegram",
      url: URL,
      secretToken: "tg-webhook-secret",
    },
    requiredKeys: ["secretToken"],
  },
  {
    name: "bilibili",
    config: {
      channel: "bilibili",
      url: URL,
      clientId: "395c8275dd674f17",
      clientSecret: "bilibili_app_secret",
    },
    requiredKeys: ["clientId", "clientSecret"],
  },
];

function withPadded(
  config: ConnectionConfig,
  keys: string[],
): ConnectionConfig {
  const record = config as unknown as Record<string, string>;
  const padded: Record<string, string> = {
    ...record,
    url: `  ${record.url}  `,
  };
  for (const key of keys) {
    padded[key] = `  ${record[key]}  `;
  }
  return padded as unknown as ConnectionConfig;
}

describe("trim 统一：包围空白仍算已配置", () => {
  it.each(CASES)("$name", ({ config, requiredKeys }) => {
    expect(isConnectionReady(config)).toBe(true);
    expect(isConnectionReady(withPadded(config, requiredKeys))).toBe(true);
  });
});

describe("trim 统一：空白串一律视为未填（含意图行为变更）", () => {
  it.each(CASES)("$name", ({ config, requiredKeys }) => {
    expect(isConnectionReady({ ...config, url: "   " })).toBe(false);
    for (const key of requiredKeys) {
      expect(
        isConnectionReady({ ...config, [key]: "   " } as ConnectionConfig),
      ).toBe(false);
    }
  });
});

describe("feishu 收敛：credentialReady 不再复核 url", () => {
  it("url 缺席时行内必填集仍过，公共前置在 isConnectionReady 唯一生效", () => {
    const feishu = CASES.find((item) => item.name === "feishu")
      ?.config as Extract<ConnectionConfig, { channel: "feishu" }>;
    expect(
      channelTraits("feishu").credentialReady({ ...feishu, url: "" }),
    ).toBe(true);
    expect(isConnectionReady({ ...feishu, url: "" })).toBe(false);
    expect(isConnectionReady({ ...feishu, verificationToken: "   " })).toBe(
      false,
    );
  });
});
