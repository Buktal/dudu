import { describe, expect, it } from "vitest";

import type { ConnectionConfig } from "../api";
import {
  defaultAlipayConnection,
  defaultBilibiliConnection,
  defaultElemeConnection,
  defaultJingdongConnection,
  defaultMeituanConnection,
  defaultPinduoduoConnection,
  defaultTaobaoConnection,
  defaultTelegramConnection,
  defaultWhatsappConnection,
  isConnectionReady,
} from "../channel-traits";
import { initialConnectionsState, selectConnection } from "./connections-slice";

/**
 * 「已配置」的内容判定（isConnectionReady）按渠道必填集的单测——
 * 交易/海外系渠道组（taobao/jingdong/pinduoduo/meituan/eleme/alipay/
 * whatsapp/telegram/bilibili）。渠道组拆分说明见
 * ./is-connection-ready.test.ts。
 */

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

describe("isConnectionReady（B站核必填集，开放平台 Webhooks）", () => {
  it("url/clientId/clientSecret 齐全才算已配置（clientId 即 x-bili-accesskeyid 官方必填项）", () => {
    expect(isConnectionReady(savedBilibili)).toBe(true);
  });

  it("缺 url/clientId/clientSecret 任一都不算已配置（任一缺失即签名不可复算）", () => {
    expect(isConnectionReady({ ...savedBilibili, url: "" })).toBe(false);
    expect(isConnectionReady({ ...savedBilibili, url: "  " })).toBe(false);
    expect(isConnectionReady({ ...savedBilibili, clientId: "" })).toBe(false);
    expect(isConnectionReady({ ...savedBilibili, clientSecret: "" })).toBe(
      false,
    );
  });

  it("初始 B站占位连接（凭据全空、x-bili-* 头表 HMAC-SHA256 验签起步）不算已配置", () => {
    expect(defaultBilibiliConnection.channel).toBe("bilibili");
    expect(defaultBilibiliConnection.url).toBe(
      "http://127.0.0.1:8080/webhooks/bilibili",
    );
    expect(defaultBilibiliConnection.clientId).toBe("");
    expect(defaultBilibiliConnection.clientSecret).toBe("");
    expect(
      isConnectionReady(selectConnection(initialConnectionsState, "bilibili")),
    ).toBe(false);
  });
});
