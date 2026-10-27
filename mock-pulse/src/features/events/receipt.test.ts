import { describe, expect, it } from "vitest";

import emptyBodyModes from "../../../shared/receipt-empty-body-modes.json";
import { DEFAULT_EXPECTED } from "./model";
import { describeExpected, RECEIPT_BODY_MODES } from "./receipt";

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
    expect(
      describeExpected({
        status: 200,
        body: "Arq0D5A61EgUu4OxUvOp",
        bodyMode: "qqSignReply",
      }),
    ).toBe(
      "期望 HTTP 200，op13 验签回包 plain_token 回显「Arq0D5A61EgUu4OxUvOp」（Ed25519 验签由适配器完成）",
    );
  });

  it("空正文免校验白名单：三种 reply 形态永不展示为「不校验正文」（与 verdict.rs 共读同一夹具）", () => {
    // 白名单夹具恒为三种 reply 形态，且全部是编辑器可选形态（防夹具拼写漂移）
    expect(emptyBodyModes).toEqual([
      "wecomReply",
      "dingtalkReply",
      "qqSignReply",
    ]);
    expect(
      emptyBodyModes.every((mode) =>
        RECEIPT_BODY_MODES.some((option) => option.id === mode),
      ),
    ).toBe(true);

    // 白名单成员空正文按各自形态描述，不落入「不校验正文」
    for (const mode of [
      "wecomReply",
      "dingtalkReply",
      "qqSignReply",
    ] as const) {
      expect(
        describeExpected({ status: 200, body: "", bodyMode: mode }),
      ).not.toBe("期望 HTTP 200，不校验正文");
    }
    // 白名单外空正文仍按「不校验正文」展示
    for (const mode of ["contains", "equals", "jsonField"] as const) {
      expect(describeExpected({ status: 200, body: "", bodyMode: mode })).toBe(
        "期望 HTTP 200，不校验正文",
      );
    }
  });
});
