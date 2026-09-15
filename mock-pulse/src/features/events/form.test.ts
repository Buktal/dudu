import { describe, expect, it } from "vitest";

import {
  buildFormBody,
  formDecodeValue,
  formEncodeValue,
  parseFormBody,
} from "./form";

describe("form 拼装（wire = form 的线上字节单点）", () => {
  it("标量字段按文档序输出 key=value & 连接", () => {
    expect(
      buildFormBody({ order_id: "27061900338318741", pay_type: 2, flag: true }),
    ).toBe("order_id=27061900338318741&pay_type=2&flag=true");
  });

  it("非 ASCII 与保留字符按 RFC 3986 百分号编码（大写 hex、UTF-8 字节序）", () => {
    // 官方核验样本值「药品01店」的 UTF-8 字节序
    expect(buildFormBody({ wm_poi_name: "药品01店" })).toBe(
      "wm_poi_name=%E8%8D%AF%E5%93%8101%E5%BA%97",
    );
    // 空格（%20）、+/=.~ 保留集、非法序列均走确定性路径
    expect(formEncodeValue("a b+c=d.e~f-g_h")).toBe("a%20b%2Bc%3Dd.e~f-g_h");
    expect(formEncodeValue("")).toBe("");
  });

  it("对象/数组先 JSON 字符串化再作字段值（官方口径），解析侧还原 JSON 结构", () => {
    const payload = {
      backup_recipient_phone: ["13812345678_1236", "13812345678_3456"],
    };
    const text = buildFormBody(payload);
    expect(text).toBe(
      "backup_recipient_phone=%5B%2213812345678_1236%22%2C%2213812345678_3456%22%5D",
    );
    expect(parseFormBody(text)).toEqual(payload);
  });

  it("文本值不以 JSON 结构开头时保持文本（push_content 等 JSON 形字符串不受影响）", () => {
    const text = "push_content=%7B%22a%22%3A1%7D&plain=%5Bx%5D";
    const parsed = parseFormBody(text);
    // %7B… 合法 JSON → 对象；%5Bx%5D（非法 JSON）→ 原文文本
    expect(parsed).toEqual({ push_content: { a: 1 }, plain: "[x]" });
  });

  it("无值参数落空串（官方「没有值的参数也需拼接」形态），容忍 key= 与 key 两种形态", () => {
    expect(parseFormBody("extended_field=&flag")).toEqual({
      extended_field: "",
      flag: "",
    });
  });

  it("解析容忍首尾空白与「+」还原空格（form 惯例）", () => {
    expect(parseFormBody("  a=%E8%8D%AF+b  ")).toEqual({ a: "药 b" });
  });

  it("拼装 ↔ 解析逐字节自反（canonical 编码往返一致）", () => {
    const payload = {
      order_id: "27061900338318741",
      wm_poi_name: "药品01店",
      backup_recipient_phone: ["13812345678_1236"],
      extended_field: "",
    };
    const text = buildFormBody(payload);
    expect(buildFormBody(parseFormBody(text))).toBe(text);
  });

  it("非法输入抛可读错误：空报文/连续 &/重复字段/坏字段名/空值/坏百分号编码", () => {
    expect(() => parseFormBody("")).toThrow("内容为空");
    expect(() => parseFormBody("a=1&&b=2")).toThrow("空字段");
    expect(() => parseFormBody("a=1&a=2")).toThrow("重复字段：a");
    expect(parseFormBody("a.b.c=1")).toEqual({ "a.b.c": "1" });
    expect(() => buildFormBody({ "1bad": 1 })).toThrow("无效的表单字段名");
    // 保留字段名（safePath）：对象字面量语法吃掉 __proto__，用 defineProperty 构造
    const protoKey = Object.defineProperty({}, "__proto__", {
      value: 1,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    expect(() => buildFormBody(protoKey)).toThrow("无效的表单字段名");
    expect(() => buildFormBody({ none: null })).toThrow("值不能为空");
    expect(() => parseFormBody("a=%ZZ")).toThrow("百分号编码");
    expect(() => parseFormBody("a=%E8%8D")).toThrow("UTF-8");
    expect(() => formDecodeValue("a%2")).toThrow("百分号编码");
  });

  it("解码：formDecodeValue 与 formEncodeValue 互逆（保留字符除外按规范还原）", () => {
    expect(formDecodeValue("%E8%8D%AF%E5%93%8101%E5%BA%97")).toBe("药品01店");
    expect(formDecodeValue("a+b%2Bc")).toBe("a b+c");
    expect(formDecodeValue("plain")).toBe("plain");
  });
});
