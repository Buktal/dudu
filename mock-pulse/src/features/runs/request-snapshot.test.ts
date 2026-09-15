import { describe, expect, it } from "vitest";

import type { RunStep } from "./model";
import { requestSnapshot } from "./request-snapshot";

/**
 * 发送请求快照的按渠道呈现单测：钉住各渠道头模板/query/报文体的字节形态，
 * 以及未列渠道的显式通用形态（code-review 退件：不再静默套用抖音头模板）。
 */

function makeStep(overrides: Partial<RunStep> = {}): RunStep {
  return {
    eventName: "测试事件",
    eventId: "evt-1",
    channel: "douyin",
    url: "http://127.0.0.1:8080/hook",
    payload: '{"event":"test"}',
    signature: "sig-abc",
    msgId: "msg-1",
    receipt: { status: 200, elapsedMs: 5, body: "", reply: null, error: null },
    verdict: { passed: true, reason: "ok" },
    ...overrides,
  };
}

describe("requestSnapshot（按渠道快照呈现）", () => {
  it("抖音：X-Douyin-Signature + Msg-Id 头，body 即载荷", () => {
    expect(requestSnapshot(makeStep())).toBe(
      'POST http://127.0.0.1:8080/hook\nContent-Type: application/json\nX-Douyin-Signature: sig-abc\nMsg-Id: msg-1\n\n{"event":"test"}',
    );
  });

  it("企微：msg_signature 走 URL query，body 优先取加密信封并附加密前 XML", () => {
    const step = makeStep({
      channel: "wecom",
      url: "http://127.0.0.1:8080/hook?agentid=1",
      signature: "sig=q",
      timestamp: "1700000000",
      msgId: "nonce-1",
      payload: "<xml><ToUserName>demo</ToUserName></xml>",
      requestBody: "<xml><Encrypt>enc</Encrypt></xml>",
    });
    expect(requestSnapshot(step)).toBe(
      "POST http://127.0.0.1:8080/hook?agentid=1&msg_signature=sig%3Dq&timestamp=1700000000&nonce=nonce-1\nContent-Type: text/xml\n\n<xml><Encrypt>enc</Encrypt></xml>\n\n加密前 XML：\n<xml><ToUserName>demo</ToUserName></xml>",
    );
  });

  it("企微旧记录：无 requestBody 时回退占位文案", () => {
    const step = makeStep({ channel: "wecom", requestBody: null });
    expect(requestSnapshot(step)).toContain("（旧记录未保存加密信封）");
  });

  it("QQ：普通事件带 Ed25519 双头；op13 验证回调无签名头改 UA + AppID", () => {
    expect(requestSnapshot(makeStep({ channel: "qq" }))).toBe(
      'POST http://127.0.0.1:8080/hook\nContent-Type: application/json\nX-Signature-Ed25519: sig-abc\nX-Signature-Timestamp: \n\n{"event":"test"}',
    );
    expect(requestSnapshot(makeStep({ channel: "qq", signature: "" }))).toBe(
      'POST http://127.0.0.1:8080/hook\nContent-Type: application/json\nUser-Agent: QQBot-Callback（op13 验证回调）\nX-Bot-Appid: <连接 AppID>\n\n{"event":"test"}',
    );
  });

  it("微博：三参签名走 URL query（nonce 取 msgId）", () => {
    expect(
      requestSnapshot(makeStep({ channel: "weibo", timestamp: "1700000000" })),
    ).toBe(
      'POST http://127.0.0.1:8080/hook?signature=sig-abc&timestamp=1700000000&nonce=msg-1\nContent-Type: application/json\n\n{"event":"test"}',
    );
  });

  it("小红书：body 优先取 requestBody，包裹前后不同时附明文对照", () => {
    const wrapped = makeStep({
      channel: "xiaohongshu",
      payload: '{"Nonce":"n"}',
      requestBody: '[{"Nonce":"n"}]',
    });
    expect(requestSnapshot(wrapped)).toBe(
      'POST http://127.0.0.1:8080/hook\nContent-Type: application/json\n\n[{"Nonce":"n"}]\n\n加密/包裹前明文：\n{"Nonce":"n"}',
    );
    // 相同时不重复附明文
    const same = makeStep({
      channel: "xiaohongshu",
      payload: "p",
      requestBody: "p",
    });
    expect(requestSnapshot(same)).not.toContain("加密/包裹前明文");
  });

  it("快手/淘宝/WhatsApp/Telegram：渠道签名各归其头，body 即载荷", () => {
    expect(requestSnapshot(makeStep({ channel: "kuaishou" }))).toContain(
      "\nkwaisign: sig-abc\n",
    );
    expect(requestSnapshot(makeStep({ channel: "taobao" }))).toContain(
      "\nAuthorization: sig-abc\n",
    );
    expect(requestSnapshot(makeStep({ channel: "whatsapp" }))).toContain(
      "\nX-Hub-Signature-256: sig-abc\n",
    );
    expect(requestSnapshot(makeStep({ channel: "telegram" }))).toContain(
      "\nX-Telegram-Bot-Api-Secret-Token: sig-abc\n",
    );
  });

  it("B站：x-bili-timestamp 快照 + Authorization 双头", () => {
    expect(
      requestSnapshot(
        makeStep({ channel: "bilibili", timestamp: "2026-09-15 10:00:00" }),
      ),
    ).toBe(
      'POST http://127.0.0.1:8080/hook\nContent-Type: application/json\nx-bili-timestamp: 2026-09-15 10:00:00\nAuthorization: sig-abc\n\n{"event":"test"}',
    );
  });

  it("京东/拼多多：系统参数走 URL query 且 timestamp 编码", () => {
    const jd = requestSnapshot(
      makeStep({ channel: "jingdong", timestamp: "2026-09-15 10:00:00" }),
    );
    expect(jd).toContain(
      "?app_key=<连接 AppKey>&timestamp=2026-09-15%2010%3A00%3A00&v=2.0&sign=sig-abc",
    );
    expect(jd).toContain("Content-Type: application/json");
    const pdd = requestSnapshot(
      makeStep({ channel: "pinduoduo", timestamp: "1700000000" }),
    );
    expect(pdd).toContain(
      "?client_id=<连接 ClientID>&timestamp=1700000000&sign=sig-abc",
    );
  });

  it("饿了么：按载荷判型区分 Content-Type，系统参数走 query", () => {
    const json = requestSnapshot(makeStep({ channel: "eleme" }));
    expect(json).toContain(
      "?consumer_key=<连接 ConsumerKey>&sig=sig-abc&timestamp=",
    );
    expect(json).toContain("Content-Type: application/json");
    const form = requestSnapshot(
      makeStep({ channel: "eleme", payload: "push_action=1&order_id=1" }),
    );
    expect(form).toContain("Content-Type: application/x-www-form-urlencoded");
  });

  it("美团/支付宝：form-urlencoded，body 优先取 requestBody 快照", () => {
    for (const channel of ["meituan", "alipay"] as const) {
      const step = makeStep({
        channel,
        payload: "biz=plain",
        requestBody: "biz=sent&sig=x",
      });
      expect(requestSnapshot(step)).toBe(
        "POST http://127.0.0.1:8080/hook\nContent-Type: application/x-www-form-urlencoded\n\nbiz=sent&sig=x",
      );
    }
  });

  it("未列渠道显式通用形态：只渲染方法/URL/报文体，不套任何渠道专属头", () => {
    // 公众号/小程序/飞书/钉钉在快照表未列（旧行为静默套用抖音头模板，已显式化）；
    // 注册表外渠道（知乎）同样走通用形态，不误用任何渠道头
    for (const channel of [
      "wechat-mp",
      "wechat-mini",
      "feishu",
      "dingtalk",
      "zhihu",
    ]) {
      const step = { ...makeStep(), channel } as RunStep;
      const snapshot = requestSnapshot(step);
      expect(snapshot).toBe(
        'POST http://127.0.0.1:8080/hook\n\n{"event":"test"}',
      );
      expect(snapshot).not.toContain("X-Douyin-Signature");
      expect(snapshot).not.toContain("Content-Type");
    }
  });
});
