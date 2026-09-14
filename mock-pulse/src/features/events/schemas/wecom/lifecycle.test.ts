import { describe, expect, it } from "vitest";

import { schemaById } from "../registry";
import { WECOM_AGENT_LIFECYCLE_EVENT_SCHEMAS } from "./lifecycle";

describe("企微事件字典 · 应用活跃度", () => {
  it("提供 inactive/close/reopen/low_active/active_restored 六个模板", () => {
    expect(
      WECOM_AGENT_LIFECYCLE_EVENT_SCHEMAS.map((schema) => schema.id),
    ).toEqual([
      "wc-inactive-alert",
      "wc-close-inactive-agent",
      "wc-reopen-inactive-agent",
      "wc-low-active-alert",
      "wc-low-active",
      "wc-active-restored",
    ]);
    expect(schemaById("wc-active-restored").eventName).toBe("active_restored");
  });

  it("预警类带 EffectTime 裸文本时间戳，其余系统事件只含公共字段", () => {
    expect(schemaById("wc-inactive-alert").payload).toMatchObject({
      Event: "inactive_alert",
      EffectTime: "1609459200",
    });
    expect(schemaById("wc-low-active-alert").payload.EffectTime).toBe(
      "1609459200",
    );
    for (const id of [
      "wc-close-inactive-agent",
      "wc-reopen-inactive-agent",
      "wc-low-active",
      "wc-active-restored",
    ]) {
      expect(schemaById(id).payload.EffectTime).toBeUndefined();
    }
    // EffectTime 走裸文本排版（官方数值时间戳不带 CDATA）
    expect(schemaById("wc-inactive-alert").xmlLayout?.bareTags).toContain(
      "CreateTime",
    );
  });
});
