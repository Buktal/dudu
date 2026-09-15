import { describe, expect, it } from "vitest";

import type { ConnectionConfig } from "../api";
import {
  defaultWechatMiniConnection,
  defaultWechatMpConnection,
} from "../channel-defaults";
import { initialConnectionsState, selectConnection } from "./connections-slice";
import { isConnectionReady } from "./is-connection-ready";

/**
 * 「已配置」的内容判定（isConnectionReady）按渠道必填集的单测。
 * 自旧单文件按渠道组拆分（单文件 ≤ 500 行，code-review 退件）：
 * 本文件收微信系与抖音（douyin/wecom/wechat-mp/wechat-mini），
 * IM/内容系在 ./is-connection-ready-im.test.ts，交易/海外系在
 * ./is-connection-ready-trade.test.ts。
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

  it("注册表外渠道（持久化混入怪数据）不算已配置，fail-safe 不套用任何渠道规则", () => {
    // 样例取注册表外 id：知乎无推送不入表，事实库结论
    const rogue = { channel: "zhihu" } as unknown as ConnectionConfig;
    expect(isConnectionReady(rogue)).toBe(false);
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
