import { describe, expect, it } from "vitest";

import { DEFAULT_EXPECTED } from "./model";
import { describeExpected } from "./receipt";

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
    ).toBe("期望 HTTP 200，微信系回执为空串");
    expect(
      describeExpected({
        status: 200,
        body: "<Content><![CDATA[hi]]></Content>",
        bodyMode: "wecomReply",
      }),
    ).toBe(
      "期望 HTTP 200，微信系解密被动回复包含「<Content><![CDATA[hi]]></Content>」",
    );
  });
});
