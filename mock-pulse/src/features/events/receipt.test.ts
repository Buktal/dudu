import { describe, expect, it } from "vitest";

import { DEFAULT_EXPECTED } from "./model";
import { compareReceipt, describeExpected } from "./receipt";

const fact = (status: number, body: string) => ({ status, body });

describe("compareReceipt 状态码比对", () => {
  it("状态不符不通过，原因同时给出实际与期望", () => {
    const verdict = compareReceipt(
      { status: 200, body: "", bodyMode: "contains" },
      fact(500, "boom"),
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toContain("500");
    expect(verdict.reason).toContain("200");
  });

  it("未收到响应（status 0）不通过", () => {
    const verdict = compareReceipt(
      { status: 200, body: "", bodyMode: "contains" },
      fact(0, ""),
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toContain("未收到响应");
  });

  it("未设期望正文（默认期望）只检查状态码", () => {
    const verdict = compareReceipt(DEFAULT_EXPECTED, fact(200, "anything"));
    expect(verdict).toMatchObject({ passed: true });
    expect(verdict.reason).toContain("200");
  });
});

describe("compareReceipt 正文形态", () => {
  it("包含：回执正文包含期望片段即通过", () => {
    const expected = { status: 200, body: "ok", bodyMode: "contains" } as const;
    expect(compareReceipt(expected, fact(200, '{"msg":"ok"}')).passed).toBe(
      true,
    );
    expect(compareReceipt(expected, fact(200, '{"msg":"retry"}')).passed).toBe(
      false,
    );
  });

  it("完全一致：逐字相等，多一个空格都不通过", () => {
    const expected = {
      status: 200,
      body: '{"code":0}',
      bodyMode: "equals",
    } as const;
    expect(compareReceipt(expected, fact(200, '{"code":0}')).passed).toBe(true);
    expect(compareReceipt(expected, fact(200, '{"code": 0}')).passed).toBe(
      false,
    );
  });

  it("JSON 字段：期望对象是回执的子集即通过（回执可有额外字段）", () => {
    const expected = {
      status: 200,
      body: '{"code":0,"data":{"ok":true}}',
      bodyMode: "jsonField",
    } as const;
    const actual = '{"code":0,"msg":"hi","data":{"ok":true,"extra":[1]}}';
    expect(compareReceipt(expected, fact(200, actual)).passed).toBe(true);
  });

  it("JSON 字段：缺失字段或值不一致不通过，原因指明路径", () => {
    const expected = {
      status: 200,
      body: '{"code":0,"data":{"ok":true}}',
      bodyMode: "jsonField",
    } as const;
    const missing = compareReceipt(expected, fact(200, '{"code":0}'));
    expect(missing.passed).toBe(false);
    expect(missing.reason).toContain("data.ok");

    const wrongValue = compareReceipt(
      expected,
      fact(200, '{"code":0,"data":{"ok":false}}'),
    );
    expect(wrongValue.passed).toBe(false);
    expect(wrongValue.reason).toContain("data.ok");
    expect(wrongValue.reason).toContain("true");
    expect(wrongValue.reason).toContain("false");
  });

  it("JSON 字段：数组按序逐项比对，回执可有额外元素", () => {
    const expected = {
      status: 200,
      body: '{"items":[{"id":1}]}',
      bodyMode: "jsonField",
    } as const;
    // 前缀按序匹配：回执多出的元素不影响通过
    expect(
      compareReceipt(expected, fact(200, '{"items":[{"id":1},{"id":2}]}'))
        .passed,
    ).toBe(true);
    // 首项值不一致：原因指明 items[0].id
    const wrongFirst = compareReceipt(
      expected,
      fact(200, '{"items":[{"id":9}]}'),
    );
    expect(wrongFirst.passed).toBe(false);
    expect(wrongFirst.reason).toContain("items[0].id");
    // 回执数组比期望短：不通过
    expect(compareReceipt(expected, fact(200, '{"items":[]}')).passed).toBe(
      false,
    );
  });

  it("JSON 字段：期望或回执不是合法 JSON 时给出可读原因", () => {
    const expected = {
      status: 200,
      body: '{"code":0}',
      bodyMode: "jsonField",
    } as const;
    const badExpected = {
      status: 200,
      body: "{oops",
      bodyMode: "jsonField",
    } as const;
    expect(
      compareReceipt(badExpected, fact(200, '{"code":0}')).reason,
    ).toContain("期望正文不是合法 JSON");
    expect(compareReceipt(expected, fact(200, "not json")).reason).toContain(
      "回执正文不是合法 JSON",
    );
  });
});

describe("compareReceipt 企微回执形态（wecomReply）", () => {
  const wecomFact = (body: string, reply: string | null = null) => ({
    status: 200,
    body,
    reply,
  });

  it("期望空串：仅回执正文为空串时通过（success 或加密包都不算空串）", () => {
    const expected = {
      status: 200,
      body: "",
      bodyMode: "wecomReply",
    } as const;
    expect(compareReceipt(expected, wecomFact("")).passed).toBe(true);
    expect(compareReceipt(expected, wecomFact("success")).passed).toBe(false);
    expect(compareReceipt(expected, wecomFact("<xml>…</xml>")).passed).toBe(
      false,
    );
  });

  it("期望 success：逐字相等，官方要求不带引号", () => {
    const expected = {
      status: 200,
      body: "success",
      bodyMode: "wecomReply",
    } as const;
    expect(compareReceipt(expected, wecomFact("success")).passed).toBe(true);
    expect(compareReceipt(expected, wecomFact('"success"')).passed).toBe(false);
    expect(compareReceipt(expected, wecomFact("")).passed).toBe(false);
    expect(compareReceipt(expected, wecomFact("SUCCESS")).passed).toBe(false);
  });

  it("期望加密被动回复：解密明文包含期望片段即通过", () => {
    const expected = {
      status: 200,
      body: "<Content><![CDATA[this is a test]]></Content>",
      bodyMode: "wecomReply",
    } as const;
    const reply =
      "<xml><ToUserName><![CDATA[fromUser]]></ToUserName><Content><![CDATA[this is a test]]></Content></xml>";
    const rawEnvelope =
      "<xml><Encrypt><![CDATA[RypEvHKD8QQK…]]></Encrypt><MsgSignature><![CDATA[sig]]></MsgSignature></xml>";
    const verdict = compareReceipt(expected, wecomFact(rawEnvelope, reply));
    expect(verdict.passed).toBe(true);
    expect(verdict.reason).toContain("解密");
  });

  it("期望加密被动回复但目标未回加密包：不通过，原因可读", () => {
    const expected = {
      status: 200,
      body: "<Content><![CDATA[hi]]></Content>",
      bodyMode: "wecomReply",
    } as const;
    const noReply = compareReceipt(expected, wecomFact("success", null));
    expect(noReply.passed).toBe(false);
    expect(noReply.reason).toContain("加密被动回复");

    const wrongReply = compareReceipt(
      expected,
      wecomFact("<xml>…</xml>", "<xml><Other/></xml>"),
    );
    expect(wrongReply.passed).toBe(false);
  });
});

describe("describeExpected", () => {
  it("描述期望：仅状态 / 状态 + 正文形态", () => {
    expect(describeExpected(DEFAULT_EXPECTED)).toBe(
      "期望 HTTP 200，不校验正文",
    );
    expect(
      describeExpected({ status: 403, body: "denied", bodyMode: "contains" }),
    ).toBe("期望 HTTP 403，正文包含「denied」");
    expect(
      describeExpected({ status: 200, body: '{"code":0}', bodyMode: "equals" }),
    ).toBe('期望 HTTP 200，正文完全一致「{"code":0}」');
    expect(
      describeExpected({
        status: 200,
        body: '{"code":0}',
        bodyMode: "jsonField",
      }),
    ).toBe('期望 HTTP 200，正文含 JSON 字段「{"code":0}」');
    expect(
      describeExpected({ status: 200, body: "", bodyMode: "wecomReply" }),
    ).toBe("期望 HTTP 200，企微回执为空串");
    expect(
      describeExpected({
        status: 200,
        body: "<Content><![CDATA[hi]]></Content>",
        bodyMode: "wecomReply",
      }),
    ).toBe(
      "期望 HTTP 200，企微解密被动回复包含「<Content><![CDATA[hi]]></Content>」",
    );
  });
});
