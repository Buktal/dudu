import { describe, expect, it } from "vitest";

import type { ConnectionConfig } from "../api";
import {
  defaultAlipayConnection,
  defaultDingtalkConnection,
  defaultElemeConnection,
  defaultFeishuConnection,
  defaultJingdongConnection,
  defaultKuaishouConnection,
  defaultMeituanConnection,
  defaultPinduoduoConnection,
  defaultQqConnection,
  defaultTaobaoConnection,
  defaultTelegramConnection,
  defaultWechatMiniConnection,
  defaultWechatMpConnection,
  defaultWeiboConnection,
  defaultWhatsappConnection,
  defaultXiaohongshuConnection,
  initialConnectionsState,
  selectConnection,
} from "./connections-slice";
import { isConnectionReady } from "./is-connection-ready";

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

describe("isConnectionReady（淘宝核必填集，全球栈 HTTPS 回调）", () => {
  it("url/appKey/appSecret 齐全才算已配置（验签消息体 = AppKey+body，密钥 = AppSecret）", () => {
    expect(isConnectionReady(savedTaobao)).toBe(true);
  });

  it("缺 url/appKey/appSecret 任一都不算已配置", () => {
    expect(isConnectionReady({ ...savedTaobao, url: "" })).toBe(false);
    expect(isConnectionReady({ ...savedTaobao, url: "  " })).toBe(false);
    expect(isConnectionReady({ ...savedTaobao, appKey: "" })).toBe(false);
    expect(isConnectionReady({ ...savedTaobao, appSecret: "" })).toBe(false);
  });

  it("初始淘宝占位连接（凭据全空、HMAC-SHA256 验签起步）不算已配置", () => {
    expect(defaultTaobaoConnection.channel).toBe("taobao");
    expect(defaultTaobaoConnection.url).toBe(
      "http://127.0.0.1:8080/webhooks/taobao",
    );
    expect(defaultTaobaoConnection.appKey).toBe("");
    expect(defaultTaobaoConnection.appSecret).toBe("");
    expect(
      isConnectionReady(selectConnection(initialConnectionsState, "taobao")),
    ).toBe(false);
  });
});

describe("isConnectionReady（京东核必填集，JOS 消息推送模拟）", () => {
  it("url/appKey/appSecret 齐全才算已配置（sign = UPPER(MD5(appSecret+字母序 k+v+appSecret))）", () => {
    expect(isConnectionReady(savedJingdong)).toBe(true);
  });

  it("缺 url/appKey/appSecret 任一都不算已配置", () => {
    expect(isConnectionReady({ ...savedJingdong, url: "" })).toBe(false);
    expect(isConnectionReady({ ...savedJingdong, url: "  " })).toBe(false);
    expect(isConnectionReady({ ...savedJingdong, appKey: "" })).toBe(false);
    expect(isConnectionReady({ ...savedJingdong, appSecret: "" })).toBe(false);
  });

  it("初始京东占位连接（凭据全空、MD5 签名起步）不算已配置", () => {
    expect(defaultJingdongConnection.channel).toBe("jingdong");
    expect(defaultJingdongConnection.url).toBe(
      "http://127.0.0.1:8080/webhooks/jingdong",
    );
    expect(defaultJingdongConnection.appKey).toBe("");
    expect(defaultJingdongConnection.appSecret).toBe("");
    expect(
      isConnectionReady(selectConnection(initialConnectionsState, "jingdong")),
    ).toBe(false);
  });
});

describe("isConnectionReady（拼多多核必填集，PMC 订阅推送模拟）", () => {
  it("url/clientId/clientSecret 齐全才算已配置（sign = UPPER(MD5(client_secret+ASCII 排序 kv+client_secret))）", () => {
    expect(isConnectionReady(savedPinduoduo)).toBe(true);
  });

  it("缺 url/clientId/clientSecret 任一都不算已配置", () => {
    expect(isConnectionReady({ ...savedPinduoduo, url: "" })).toBe(false);
    expect(isConnectionReady({ ...savedPinduoduo, url: "  " })).toBe(false);
    expect(isConnectionReady({ ...savedPinduoduo, clientId: "" })).toBe(false);
    expect(isConnectionReady({ ...savedPinduoduo, clientSecret: "" })).toBe(
      false,
    );
  });

  it("初始拼多多占位连接（凭据全空、UPPER(MD5) 签名起步）不算已配置", () => {
    expect(defaultPinduoduoConnection.channel).toBe("pinduoduo");
    expect(defaultPinduoduoConnection.url).toBe(
      "http://127.0.0.1:8080/webhooks/pinduoduo",
    );
    expect(defaultPinduoduoConnection.clientId).toBe("");
    expect(defaultPinduoduoConnection.clientSecret).toBe("");
    expect(
      isConnectionReady(selectConnection(initialConnectionsState, "pinduoduo")),
    ).toBe(false);
  });
});

describe("isConnectionReady（美团核必填集，合作中心表单回调模拟）", () => {
  it("url/appId/appSecret 齐全才算已配置（sig = MD5(url?字母序 k=v 串 + app secret)）", () => {
    expect(isConnectionReady(savedMeituan)).toBe(true);
  });

  it("缺 url/appId/appSecret 任一都不算已配置", () => {
    expect(isConnectionReady({ ...savedMeituan, url: "" })).toBe(false);
    expect(isConnectionReady({ ...savedMeituan, url: "  " })).toBe(false);
    expect(isConnectionReady({ ...savedMeituan, appId: "" })).toBe(false);
    expect(isConnectionReady({ ...savedMeituan, appSecret: "" })).toBe(false);
  });

  it("初始美团占位连接（凭据全空、合作中心 MD5 签名起步）不算已配置", () => {
    expect(defaultMeituanConnection.channel).toBe("meituan");
    expect(defaultMeituanConnection.url).toBe(
      "http://127.0.0.1:8080/webhooks/meituan",
    );
    expect(defaultMeituanConnection.appId).toBe("");
    expect(defaultMeituanConnection.appSecret).toBe("");
    expect(
      isConnectionReady(selectConnection(initialConnectionsState, "meituan")),
    ).toBe(false);
  });
});

describe("isConnectionReady（饿了么核必填集，用户线推送模拟）", () => {
  it("url/consumerKey/consumerSecret 齐全才算已配置（sig = SHA1(HEX(url?字母序 k=v 串 + consumer_secret))）", () => {
    expect(isConnectionReady(savedEleme)).toBe(true);
  });

  it("缺 url/consumerKey/consumerSecret 任一都不算已配置", () => {
    expect(isConnectionReady({ ...savedEleme, url: "" })).toBe(false);
    expect(isConnectionReady({ ...savedEleme, url: "  " })).toBe(false);
    expect(isConnectionReady({ ...savedEleme, consumerKey: "" })).toBe(false);
    expect(isConnectionReady({ ...savedEleme, consumerSecret: "" })).toBe(
      false,
    );
  });

  it("初始饿了么占位连接（凭据全空、用户线 SHA1 五步签名起步）不算已配置", () => {
    expect(defaultElemeConnection.channel).toBe("eleme");
    expect(defaultElemeConnection.url).toBe(
      "http://127.0.0.1:8080/webhooks/eleme",
    );
    expect(defaultElemeConnection.consumerKey).toBe("");
    expect(defaultElemeConnection.consumerSecret).toBe("");
    expect(
      isConnectionReady(selectConnection(initialConnectionsState, "eleme")),
    ).toBe(false);
  });
});

describe("isConnectionReady（支付宝核必填集，异步通知三地址模拟）", () => {
  it("url/appPrivateKey 齐全才算已配置（appId 随载荷信封记录，不参与必填集）", () => {
    expect(isConnectionReady(savedAlipay)).toBe(true);
    expect(isConnectionReady({ ...savedAlipay, appId: "" })).toBe(true);
  });

  it("缺 url 或缺 appPrivateKey 都不算已配置（私钥缺失即签名不可复算）", () => {
    expect(isConnectionReady({ ...savedAlipay, url: "" })).toBe(false);
    expect(isConnectionReady({ ...savedAlipay, url: "  " })).toBe(false);
    expect(isConnectionReady({ ...savedAlipay, appPrivateKey: "" })).toBe(
      false,
    );
  });

  it("初始支付宝占位连接（凭据全空、异步通知 RSA2 验签起步）不算已配置", () => {
    expect(defaultAlipayConnection.channel).toBe("alipay");
    expect(defaultAlipayConnection.url).toBe(
      "http://127.0.0.1:8080/webhooks/alipay",
    );
    expect(defaultAlipayConnection.appId).toBe("");
    expect(defaultAlipayConnection.appPrivateKey).toBe("");
    expect(
      isConnectionReady(selectConnection(initialConnectionsState, "alipay")),
    ).toBe(false);
  });
});

describe("isConnectionReady（WhatsApp 核必填集，Cloud API Webhook）", () => {
  it("url/appSecret/verifyToken 齐全才算已配置（App Secret 验签 + Verify Token 握手比对，两个无关值）", () => {
    expect(isConnectionReady(savedWhatsapp)).toBe(true);
  });

  it("缺 url/appSecret/verifyToken 任一都不算已配置", () => {
    expect(isConnectionReady({ ...savedWhatsapp, url: "" })).toBe(false);
    expect(isConnectionReady({ ...savedWhatsapp, url: "  " })).toBe(false);
    expect(isConnectionReady({ ...savedWhatsapp, appSecret: "" })).toBe(false);
    expect(isConnectionReady({ ...savedWhatsapp, verifyToken: "" })).toBe(
      false,
    );
  });

  it("初始 WhatsApp 占位连接（凭据全空、X-Hub-Signature-256 验签起步）不算已配置", () => {
    expect(defaultWhatsappConnection.channel).toBe("whatsapp");
    expect(defaultWhatsappConnection.url).toBe(
      "http://127.0.0.1:8080/webhooks/whatsapp",
    );
    expect(defaultWhatsappConnection.appSecret).toBe("");
    expect(defaultWhatsappConnection.verifyToken).toBe("");
    expect(
      isConnectionReady(selectConnection(initialConnectionsState, "whatsapp")),
    ).toBe(false);
  });
});

describe("isConnectionReady（Telegram 核必填集，Bot Webhook）", () => {
  it("url/secretToken 齐全才算已配置（恒等头 X-Telegram-Bot-Api-Secret-Token 是验证链路唯一要素）", () => {
    expect(isConnectionReady(savedTelegram)).toBe(true);
  });

  it("缺 url 或缺 secretToken 都不算已配置（官方无 HMAC，token 缺失即恒等头链路无法模拟）", () => {
    expect(isConnectionReady({ ...savedTelegram, url: "" })).toBe(false);
    expect(isConnectionReady({ ...savedTelegram, url: "  " })).toBe(false);
    expect(isConnectionReady({ ...savedTelegram, secretToken: "" })).toBe(
      false,
    );
  });

  it("初始 Telegram 占位连接（凭据全空、恒等头原样比对起步）不算已配置", () => {
    expect(defaultTelegramConnection.channel).toBe("telegram");
    expect(defaultTelegramConnection.url).toBe(
      "http://127.0.0.1:8080/webhooks/telegram",
    );
    expect(defaultTelegramConnection.secretToken).toBe("");
    expect(
      isConnectionReady(selectConnection(initialConnectionsState, "telegram")),
    ).toBe(false);
  });
});
