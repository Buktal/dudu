import { describe, expect, it } from "vitest";

import { CHANNELS } from "@/lib/channels";

import { defineSchema } from "./define";
import { DOUYIN_DEFINITIONS } from "./douyin";
import { EVENT_SCHEMAS, schemaById, schemasByChannel } from "./registry";
import { WECOM_DEFINITIONS } from "./wecom";

describe("事件模板聚合注册表", () => {
  it("抖音 4 + 企微 3 个模板全部入表，id 全仓库唯一", () => {
    expect(EVENT_SCHEMAS).toHaveLength(7);
    const ids = EVENT_SCHEMAS.map((schema) => schema.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("每个模板的 channelId 与所在渠道包一致（协议模块与描述文件同渠道）", () => {
    for (const channelId of ["douyin", "wecom"] as const) {
      const definitions =
        channelId === "douyin" ? DOUYIN_DEFINITIONS : WECOM_DEFINITIONS;
      for (const schema of schemasByChannel(channelId)) {
        expect(schema.channelId).toBe(channelId);
        expect(definitions.channelId).toBe(channelId);
      }
    }
  });

  it("模板版本/来源/字段与描述文件同源（装载即校验后的数据契约）", () => {
    for (const schema of EVENT_SCHEMAS) {
      const entry =
        schema.channelId === "douyin"
          ? DOUYIN_DEFINITIONS.schemas[schema.id]
          : WECOM_DEFINITIONS.schemas[schema.id];
      expect(entry, `${schema.id} 描述文件条目`).toBeDefined();
      expect(schema.version).toBe(entry?.version);
      expect(schema.source).toBe(entry?.source);
      expect(schema.fields).toEqual(entry?.fields);
    }
  });

  it("每个模板带渠道真实默认期望回执：状态码合法、正文形态在枚举内", () => {
    for (const schema of EVENT_SCHEMAS) {
      expect(
        schema.expected.status,
        `${schema.id} status`,
      ).toBeGreaterThanOrEqual(100);
      expect(schema.expected.status, `${schema.id} status`).toBeLessThanOrEqual(
        599,
      );
      expect(["contains", "equals", "jsonField", "wecomReply"]).toContain(
        schema.expected.bodyMode,
      );
    }
  });

  it("schemasByChannel：已接入渠道返回模板，其余 17 渠道返回空表", () => {
    expect(schemasByChannel("douyin").map((schema) => schema.id)).toEqual([
      "dy-text",
      "dy-image",
      "dy-enter",
      "dy-read",
    ]);
    expect(schemasByChannel("wecom").map((schema) => schema.id)).toEqual([
      "wc-text",
      "wc-enter",
      "wc-click",
    ]);
    for (const channel of CHANNELS) {
      if (channel.id === "douyin" || channel.id === "wecom") continue;
      expect(schemasByChannel(channel.id), channel.id).toEqual([]);
    }
  });

  it("schemaById：全表命中，未命中抛出明确错误", () => {
    for (const schema of EVENT_SCHEMAS) {
      expect(schemaById(schema.id).id).toBe(schema.id);
    }
    expect(() => schemaById("missing")).toThrow("未知事件模板");
  });

  it("defineSchema：描述文件缺条目时装载即炸（协议模块与文件脱节）", () => {
    expect(() =>
      defineSchema(DOUYIN_DEFINITIONS, "dy-missing", {
        eventName: "x",
        name: "x",
        kind: "event",
        contentString: false,
        wire: "json",
        expected: { status: 200, body: "", bodyMode: "contains" },
        idGenerations: [],
        payload: {},
      }),
    ).toThrow("未知事件模板的字段定义");
  });
});
