import { describe, expect, it } from "vitest";

import type { ConnectionConfig } from "../api";
import {
  defaultDingtalkConnection,
  defaultFeishuConnection,
  defaultQqConnection,
  defaultWechatMiniConnection,
  defaultWechatMpConnection,
  initialConnectionsState,
  isConnectionReady,
  selectConnection,
} from "./connections-slice";

/**
 * 「已配置」的内容判定（isConnectionReady）按渠道必填集的单测。
 * 从 connections-slice.test.ts 按职责拆出（单文件 ≤ 500 行）；
 * slice 行为（默认连接/测试路由/草稿回归）留在原文件。
 */

const savedDouyin: ConnectionConfig = {
  channel: "douyin",
  url: "http://127.0.0.1:9099/hook",
  system: "dop",
  clientKey: "ck",
  clientSecret: "cs",
  miniGameToken: "",
  isvToken: "",
  isvKey: "",
};

const savedWecom: ConnectionConfig = {
  channel: "wecom",
  url: "http://127.0.0.1:9099/wecom",
  system: "agent",
  corpId: "corp",
  token: "token",
  encodingAesKey: "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C",
  agentId: "1000002",
};

const savedWechatMp: ConnectionConfig = {
  channel: "wechat-mp",
  url: "http://127.0.0.1:9099/mp",
  appId: "wx_appid",
  token: "token",
  encodingAesKey: "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C",
  mode: "secure",
};

const savedWechatMini: ConnectionConfig = {
  channel: "wechat-mini",
  url: "http://127.0.0.1:9099/mini",
  appId: "wx_appid",
  token: "token",
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
