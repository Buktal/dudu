import { describe, expect, it } from "vitest";

import type { ConnectionConfig } from "../api";
import {
  defaultDingtalkConnection,
  defaultFeishuConnection,
  defaultKuaishouConnection,
  defaultQqConnection,
  defaultWeiboConnection,
  defaultXiaohongshuConnection,
} from "../channel-defaults";
import { initialConnectionsState, selectConnection } from "./connections-slice";
import { isConnectionReady } from "./is-connection-ready";

/**
 * 「已配置」的内容判定（isConnectionReady）按渠道必填集的单测——
 * IM/内容系渠道组（feishu/dingtalk/qq/weibo/xiaohongshu/kuaishou）。
 * 渠道组拆分说明见 ./is-connection-ready.test.ts。
 */

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
  token: "token",
  encodingAesKey: "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C",
  appId: "wx_appid",
};

const savedKuaishou: ConnectionConfig = {
  channel: "kuaishou",
  url: "http://127.0.0.1:9099/kuaishou",
  appId: "ks696650570360602063",
  appSecret: "Xgm23lSgws235hlgK",
};

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

describe("isConnectionReady（钉钉按通道核必填集）", () => {
  it("密文通道：url/token/encodingAesKey/ownerKey 齐全才算已配置（appSecret 不参与）", () => {
    expect(isConnectionReady(savedDingtalk)).toBe(true);
    expect(isConnectionReady({ ...savedDingtalk, appSecret: "" })).toBe(true);
  });

  it("密文通道缺 token/encodingAesKey/ownerKey 任一都不算已配置", () => {
    expect(isConnectionReady({ ...savedDingtalk, url: "" })).toBe(false);
    expect(isConnectionReady({ ...savedDingtalk, token: "" })).toBe(false);
    expect(isConnectionReady({ ...savedDingtalk, encodingAesKey: "" })).toBe(
      false,
    );
    expect(isConnectionReady({ ...savedDingtalk, ownerKey: "" })).toBe(false);
  });

  it("机器人通道按 appSecret 判定（密文三元组不参与）", () => {
    const bot = { ...savedDingtalk, system: "bot" as const };
    expect(isConnectionReady(bot)).toBe(true);
    expect(isConnectionReady({ ...bot, appSecret: "" })).toBe(false);
  });

  it("初始钉钉占位连接（凭据全空、密文通道起步）不算已配置", () => {
    expect(defaultDingtalkConnection.channel).toBe("dingtalk");
    expect(defaultDingtalkConnection.url).toBe(
      "http://127.0.0.1:8080/webhooks/dingtalk",
    );
    expect(defaultDingtalkConnection.system).toBe("http_crypto");
    expect(
      isConnectionReady(selectConnection(initialConnectionsState, "dingtalk")),
    ).toBe(false);
  });
});

describe("isConnectionReady（QQ 核必填集）", () => {
  it("url/appSecret 齐全才算已配置（appId 仅随连接记录，不参与必填集）", () => {
    expect(isConnectionReady(savedQq)).toBe(true);
    expect(isConnectionReady({ ...savedQq, appId: "" })).toBe(true);
  });

  it("缺 url 或缺 appSecret 都不算已配置", () => {
    expect(isConnectionReady({ ...savedQq, url: "" })).toBe(false);
    expect(isConnectionReady({ ...savedQq, url: "  " })).toBe(false);
    expect(isConnectionReady({ ...savedQq, appSecret: "" })).toBe(false);
  });

  it("初始 QQ 占位连接（凭据全空、Ed25519 验签起步）不算已配置", () => {
    expect(defaultQqConnection.channel).toBe("qq");
    expect(defaultQqConnection.url).toBe("http://127.0.0.1:8080/webhooks/qq");
    expect(defaultQqConnection.appSecret).toBe("");
    expect(
      isConnectionReady(selectConnection(initialConnectionsState, "qq")),
    ).toBe(false);
  });
});

describe("isConnectionReady（微博核必填集）", () => {
  it("url/appSecret 齐全才算已配置（App Secret 即三参 sha1 验签密钥）", () => {
    expect(isConnectionReady(savedWeibo)).toBe(true);
  });

  it("缺 url 或缺 appSecret 都不算已配置", () => {
    expect(isConnectionReady({ ...savedWeibo, url: "" })).toBe(false);
    expect(isConnectionReady({ ...savedWeibo, url: "  " })).toBe(false);
    expect(isConnectionReady({ ...savedWeibo, appSecret: "" })).toBe(false);
  });

  it("初始微博占位连接（凭据全空、App Secret 验签起步）不算已配置", () => {
    expect(defaultWeiboConnection.channel).toBe("weibo");
    expect(defaultWeiboConnection.url).toBe(
      "http://127.0.0.1:8080/webhooks/weibo",
    );
    expect(defaultWeiboConnection.appSecret).toBe("");
    expect(
      isConnectionReady(selectConnection(initialConnectionsState, "weibo")),
    ).toBe(false);
  });
});

describe("isConnectionReady（小红书按通道核必填集）", () => {
  it("小程序通道：url/token/encodingAesKey/appId 齐全才算已配置", () => {
    expect(isConnectionReady(savedXiaohongshu)).toBe(true);
    expect(isConnectionReady({ ...savedXiaohongshu, url: "" })).toBe(false);
    expect(isConnectionReady({ ...savedXiaohongshu, url: "  " })).toBe(false);
    expect(isConnectionReady({ ...savedXiaohongshu, token: "" })).toBe(false);
    expect(isConnectionReady({ ...savedXiaohongshu, encodingAesKey: "" })).toBe(
      false,
    );
    expect(isConnectionReady({ ...savedXiaohongshu, appId: "" })).toBe(false);
  });

  it("ark 通道明文直发无凭据：url 齐全即算已配置（官方无推送侧签名口径）", () => {
    const ark = {
      ...savedXiaohongshu,
      system: "ark" as const,
      token: "",
      encodingAesKey: "",
      appId: "",
    };
    expect(isConnectionReady(ark)).toBe(true);
    expect(isConnectionReady({ ...ark, url: "" })).toBe(false);
  });

  it("初始小红书占位连接（凭据全空、小程序通道起步）不算已配置", () => {
    expect(defaultXiaohongshuConnection.channel).toBe("xiaohongshu");
    expect(defaultXiaohongshuConnection.url).toBe(
      "http://127.0.0.1:8080/webhooks/xiaohongshu",
    );
    expect(defaultXiaohongshuConnection.system).toBe("miniapp");
    expect(
      isConnectionReady(
        selectConnection(initialConnectionsState, "xiaohongshu"),
      ),
    ).toBe(false);
  });
});

describe("isConnectionReady（快手核必填集）", () => {
  it("url/appId/appSecret 齐全才算已配置（AppSecret 即 kwaisign 验签密钥）", () => {
    expect(isConnectionReady(savedKuaishou)).toBe(true);
  });

  it("缺 url/appId/appSecret 任一都不算已配置", () => {
    expect(isConnectionReady({ ...savedKuaishou, url: "" })).toBe(false);
    expect(isConnectionReady({ ...savedKuaishou, url: "  " })).toBe(false);
    expect(isConnectionReady({ ...savedKuaishou, appId: "" })).toBe(false);
    expect(isConnectionReady({ ...savedKuaishou, appSecret: "" })).toBe(false);
  });

  it("初始快手占位连接（凭据全空、kwaisign 验签起步）不算已配置", () => {
    expect(defaultKuaishouConnection.channel).toBe("kuaishou");
    expect(defaultKuaishouConnection.url).toBe(
      "http://127.0.0.1:8080/webhooks/kuaishou",
    );
    expect(defaultKuaishouConnection.appSecret).toBe("");
    expect(
      isConnectionReady(selectConnection(initialConnectionsState, "kuaishou")),
    ).toBe(false);
  });
});
