import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";

import {
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
  testDingtalkConnection,
  testDouyinConnection,
  testElemeConnection,
  testFeishuConnection,
  testJingdongConnection,
  testKuaishouConnection,
  testMeituanConnection,
  testPinduoduoConnection,
  testQqConnection,
  testTaobaoConnection,
  testWechatMiniConnection,
  testWechatMpConnection,
  testWecomConnection,
  testWeiboConnection,
  testXiaohongshuConnection,
  type WechatMiniConnectionConfig,
  type WechatMpConnectionConfig,
  type WecomConnectionConfig,
  type WeiboConnectionConfig,
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

describe("connections api 契约", () => {
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

  it("testDouyinConnection 调用 connections_test_douyin 并透传配置", async () => {
    const outcome = { ok: true, message: "challenge 回显一致" };
    invokeMock.mockResolvedValueOnce(outcome);
    await expect(testDouyinConnection(douyinConfig)).resolves.toEqual(outcome);
    expect(invokeMock).toHaveBeenCalledWith("connections_test_douyin", {
      config: douyinConfig,
    });
  });

  it("testWecomConnection 调用 connections_test_wecom 并透传配置", async () => {
    const outcome = { ok: true, message: "echostr 握手成功" };
    invokeMock.mockResolvedValueOnce(outcome);
    await expect(testWecomConnection(wecomConfig)).resolves.toEqual(outcome);
    expect(invokeMock).toHaveBeenCalledWith("connections_test_wecom", {
      config: wecomConfig,
    });
  });

  it("testWechatMpConnection 调用 connections_test_wechat_mp 并透传配置", async () => {
    const outcome = { ok: true, message: "echostr 握手成功" };
    invokeMock.mockResolvedValueOnce(outcome);
    await expect(testWechatMpConnection(wechatMpConfig)).resolves.toEqual(
      outcome,
    );
    expect(invokeMock).toHaveBeenCalledWith("connections_test_wechat_mp", {
      config: wechatMpConfig,
    });
  });

  it("testWechatMiniConnection 调用 connections_test_wechat_mini 并透传配置", async () => {
    const outcome = { ok: true, message: "echostr 握手成功" };
    invokeMock.mockResolvedValueOnce(outcome);
    await expect(testWechatMiniConnection(wechatMiniConfig)).resolves.toEqual(
      outcome,
    );
    expect(invokeMock).toHaveBeenCalledWith("connections_test_wechat_mini", {
      config: wechatMiniConfig,
    });
  });

  it("testFeishuConnection 调用 connections_test_feishu 并透传配置", async () => {
    const outcome = { ok: true, message: "challenge 原样回显" };
    invokeMock.mockResolvedValueOnce(outcome);
    await expect(testFeishuConnection(feishuConfig)).resolves.toEqual(outcome);
    expect(invokeMock).toHaveBeenCalledWith("connections_test_feishu", {
      config: feishuConfig,
    });
  });

  it("testDingtalkConnection 调用 connections_test_dingtalk 并透传配置", async () => {
    const outcome = { ok: true, message: "check_url 握手成功" };
    invokeMock.mockResolvedValueOnce(outcome);
    await expect(testDingtalkConnection(dingtalkConfig)).resolves.toEqual(
      outcome,
    );
    expect(invokeMock).toHaveBeenCalledWith("connections_test_dingtalk", {
      config: dingtalkConfig,
    });
  });

  it("testQqConnection 调用 connections_test_qq 并透传配置", async () => {
    const outcome = { ok: true, message: "op13 验证回调握手成功" };
    invokeMock.mockResolvedValueOnce(outcome);
    await expect(testQqConnection(qqConfig)).resolves.toEqual(outcome);
    expect(invokeMock).toHaveBeenCalledWith("connections_test_qq", {
      config: qqConfig,
    });
  });

  it("testWeiboConnection 调用 connections_test_weibo 并透传配置", async () => {
    const outcome = { ok: true, message: "echostr 握手成功" };
    invokeMock.mockResolvedValueOnce(outcome);
    await expect(testWeiboConnection(weiboConfig)).resolves.toEqual(outcome);
    expect(invokeMock).toHaveBeenCalledWith("connections_test_weibo", {
      config: weiboConfig,
    });
  });

  it("testXiaohongshuConnection 调用 connections_test_xiaohongshu 并透传配置", async () => {
    const outcome = { ok: true, message: "echostr 握手成功" };
    invokeMock.mockResolvedValueOnce(outcome);
    await expect(testXiaohongshuConnection(xiaohongshuConfig)).resolves.toEqual(
      outcome,
    );
    expect(invokeMock).toHaveBeenCalledWith("connections_test_xiaohongshu", {
      config: xiaohongshuConfig,
    });
  });

  it("testKuaishouConnection 调用 connections_test_kuaishou 并透传配置", async () => {
    const outcome = { ok: true, message: "TEST 事件握手成功" };
    invokeMock.mockResolvedValueOnce(outcome);
    await expect(testKuaishouConnection(kuaishouConfig)).resolves.toEqual(
      outcome,
    );
    expect(invokeMock).toHaveBeenCalledWith("connections_test_kuaishou", {
      config: kuaishouConfig,
    });
  });

  it("testTaobaoConnection 调用 connections_test_taobao 并透传配置", async () => {
    const outcome = { ok: true, message: "Verify 验证成功" };
    invokeMock.mockResolvedValueOnce(outcome);
    await expect(testTaobaoConnection(taobaoConfig)).resolves.toEqual(outcome);
    expect(invokeMock).toHaveBeenCalledWith("connections_test_taobao", {
      config: taobaoConfig,
    });
  });

  it("testJingdongConnection 调用 connections_test_jingdong 并透传配置", async () => {
    const outcome = { ok: true, message: "推送探针被接受" };
    invokeMock.mockResolvedValueOnce(outcome);
    await expect(testJingdongConnection(jingdongConfig)).resolves.toEqual(
      outcome,
    );
    expect(invokeMock).toHaveBeenCalledWith("connections_test_jingdong", {
      config: jingdongConfig,
    });
  });

  it("testPinduoduoConnection 调用 connections_test_pinduoduo 并透传配置", async () => {
    const outcome = { ok: true, message: "推送探针被接受" };
    invokeMock.mockResolvedValueOnce(outcome);
    await expect(testPinduoduoConnection(pinduoduoConfig)).resolves.toEqual(
      outcome,
    );
    expect(invokeMock).toHaveBeenCalledWith("connections_test_pinduoduo", {
      config: pinduoduoConfig,
    });
  });

  it("testMeituanConnection 调用 connections_test_meituan 并透传配置", async () => {
    const outcome = { ok: true, message: "推送探针被接受" };
    invokeMock.mockResolvedValueOnce(outcome);
    await expect(testMeituanConnection(meituanConfig)).resolves.toEqual(
      outcome,
    );
    expect(invokeMock).toHaveBeenCalledWith("connections_test_meituan", {
      config: meituanConfig,
    });
  });

  it("testElemeConnection 调用 connections_test_eleme 并透传配置", async () => {
    const outcome = { ok: true, message: "推送探针被接受" };
    invokeMock.mockResolvedValueOnce(outcome);
    await expect(testElemeConnection(elemeConfig)).resolves.toEqual(outcome);
    expect(invokeMock).toHaveBeenCalledWith("connections_test_eleme", {
      config: elemeConfig,
    });
  });

  it("saveConnection 的返回列表可同时携带抖音/企微/小红书/公众号/小程序/飞书/钉钉/QQ/微博/快手/淘宝/京东/拼多多/美团/饿了么（按 channel 区分形状）", async () => {
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
    ];
    invokeMock.mockResolvedValueOnce(list);
    await expect(saveConnection(wechatMpConfig)).resolves.toEqual(list);
    expect(invokeMock).toHaveBeenCalledWith("connections_save", {
      config: wechatMpConfig,
    });
  });
});
