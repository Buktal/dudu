import { describe, expect, it } from "vitest";
import type { EventItem } from "../model";
import { schemaById } from "../schemas";
import {
  interpretEventStep,
  interpretPresence,
  interpretTemplateStep,
} from "./interpret";

/**
 * interpreter guard / view 时钟契约（C1 唯一出口补齐的时钟行）：
 * 期望值与 consequence 表的 guard / view 行逐字对齐——事件步骤按 id
 * 匹配守卫（version-missing 行在仍拦删），内置模板不可删除恒放行，
 * 存在性引用有引用即拦删、无引用放行，view 只标 missing 不拦。
 * runtime / edit 时钟与表本体的行为钉住见 ./consequences.test.ts。
 */

const TEMPLATE_VERSION = schemaById("dy-text").version;

function douyinEvent(revisions: number[]): EventItem {
  return {
    id: "evt-dy-1",
    name: "新客问价",
    channelId: "douyin",
    schemaId: "dy-text",
    versions: revisions.map((revision) => ({
      revision,
      savedAt: `2026-09-12T0${revision}:00:00.000Z`,
      payload: {
        event: "im_receive_msg",
        content: { text: `第${revision}句` },
      },
      expected: { status: 200, body: "", bodyMode: "contains" as const },
    })),
  };
}

describe("interpreter guard / view 时钟（组合根守卫与行过滤经唯一出口）", () => {
  const events = [douyinEvent([1, 2])];
  const registry = [schemaById("dy-text")];

  it("guard·事件步骤：version-missing 行在仍拦删，id-missing 放行", () => {
    expect(
      interpretEventStep(events, { eventId: "evt-dy-1", revision: 9 }, "guard")
        .blocks,
    ).toBe(true);
    expect(
      interpretEventStep(events, { eventId: "evt-gone", revision: 1 }, "guard")
        .blocks,
    ).toBe(false);
  });

  it("guard·内置模板不可删除：恒放行", () => {
    expect(
      interpretTemplateStep(
        registry,
        { templateId: "dy-text", templateVersion: TEMPLATE_VERSION },
        "guard",
      ).blocks,
    ).toBe(false);
  });

  it("guard·存在性引用：删事件与删剧本守卫共用，有引用即拦删", () => {
    // 谓词方向与本体方向相反：有引用（true）拦删，无引用放行带回谓词值
    expect(interpretPresence(true, "guard")).toEqual({ blocked: true });
    expect(interpretPresence(false, "guard")).toEqual({
      blocked: false,
      row: false,
    });
  });

  it("view·存在性引用：缺失即行不可用（过滤谓词语义，命中带回主语）", () => {
    expect(interpretPresence(false, "view")).toEqual({ blocked: true });
    expect(interpretPresence(true, "view")).toEqual({
      blocked: false,
      row: true,
    });
  });
});
