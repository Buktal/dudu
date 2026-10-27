import { describe, expect, it } from "vitest";
import type { EventItem } from "../model";
import { schemaById } from "../schemas";
import {
  interpretEventStep,
  interpretPresence,
  interpretTemplateStep,
} from "./interpret";

/**
 * interpreter 单点断言（C1）：调用时钟只传引用与时钟，{row, entry, blocks,
 * missingKind, missing, outdated} 一次给齐——替代五处重复的 status 分岔测试。
 * 期望值与 consequence 表各时钟行为测试逐字对齐（只换消费口径，不换语义）；
 * 表本体与各时钟的行为钉住见 ./consequences.test.ts。存在性（presence）
 * 两态语义不经表，在本 module 单点直译。
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

describe("interpreter guard 时钟（组合根守卫经唯一出口）", () => {
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
});

describe("interpreter 单点（各时钟一次断言）", () => {
  const events = [douyinEvent([1, 2])];
  const registry = [schemaById("dy-text")];

  it("runtime·事件三态：blocks / missingKind / 行列带回（版本缺失留行）", () => {
    const ok = interpretEventStep(
      events,
      { eventId: "evt-dy-1", revision: 2 },
      "runtime",
    );
    expect(ok).toMatchObject({
      status: "ok",
      blocks: false,
      missingKind: null,
      missing: false,
      outdated: false,
    });
    expect(ok.row?.id).toBe("evt-dy-1");
    expect(ok.entry?.revision).toBe(2);

    const idMissing = interpretEventStep(
      events,
      { eventId: "evt-gone", revision: 1 },
      "runtime",
    );
    expect(idMissing).toMatchObject({
      status: "id-missing",
      blocks: true,
      missingKind: "id",
      missing: true,
    });
    expect(idMissing.row).toBeUndefined();
    expect(idMissing.entry).toBeUndefined();

    const versionMissing = interpretEventStep(
      events,
      { eventId: "evt-dy-1", revision: 9 },
      "runtime",
    );
    expect(versionMissing).toMatchObject({
      status: "version-missing",
      blocks: true,
      missingKind: "version",
      missing: false,
    });
    expect(versionMissing.row?.id).toBe("evt-dy-1");
    expect(versionMissing.entry).toBeUndefined();
  });

  it("runtime·模板三态：版本更替同样 missing（区别于事件留行）", () => {
    const ok = interpretTemplateStep(
      registry,
      { templateId: "dy-text", templateVersion: TEMPLATE_VERSION },
      "runtime",
    );
    expect(ok).toMatchObject({
      status: "ok",
      blocks: false,
      missingKind: null,
      missing: false,
      outdated: false,
    });
    expect(ok.entry?.id).toBe("dy-text");

    const idMissing = interpretTemplateStep(
      registry,
      { templateId: "dy-gone", templateVersion: TEMPLATE_VERSION },
      "runtime",
    );
    expect(idMissing).toMatchObject({
      status: "id-missing",
      blocks: true,
      missingKind: "id",
      missing: true,
    });

    const versionMissing = interpretTemplateStep(
      registry,
      { templateId: "dy-text", templateVersion: "2999.01" },
      "runtime",
    );
    expect(versionMissing).toMatchObject({
      status: "version-missing",
      blocks: true,
      missingKind: "version",
      missing: true,
    });
    expect(versionMissing.entry).toBeUndefined();
  });

  it("view·事件：落后标 outdated、版本缺失留行不标 missing；模板恒不标 outdated", () => {
    const behind = interpretEventStep(
      events,
      { eventId: "evt-dy-1", revision: 1 },
      "view",
    );
    expect(behind).toMatchObject({
      missing: false,
      outdated: true,
      blocks: false,
    });

    const current = interpretEventStep(
      events,
      { eventId: "evt-dy-1", revision: 2 },
      "view",
    );
    expect(current).toMatchObject({ missing: false, outdated: false });

    const versionMissing = interpretEventStep(
      events,
      { eventId: "evt-dy-1", revision: 9 },
      "view",
    );
    expect(versionMissing).toMatchObject({ missing: false, outdated: false });
    expect(versionMissing.row?.id).toBe("evt-dy-1");

    const idMissing = interpretEventStep(
      events,
      { eventId: "evt-gone", revision: 1 },
      "view",
    );
    expect(idMissing).toMatchObject({ missing: true, outdated: false });

    const templateOk = interpretTemplateStep(
      registry,
      { templateId: "dy-text", templateVersion: TEMPLATE_VERSION },
      "view",
    );
    expect(templateOk).toMatchObject({ missing: false, outdated: false });
  });

  it("edit·事件只看行存在（超前 revision 放行）、模板两种缺失都拦", () => {
    expect(
      interpretEventStep(events, { eventId: "evt-gone", revision: 1 }, "edit")
        .blocks,
    ).toBe(true);
    expect(
      interpretEventStep(events, { eventId: "evt-dy-1", revision: 9 }, "edit")
        .blocks,
    ).toBe(false);
    expect(
      interpretTemplateStep(
        registry,
        { templateId: "dy-gone", templateVersion: TEMPLATE_VERSION },
        "edit",
      ).blocks,
    ).toBe(true);
    expect(
      interpretTemplateStep(
        registry,
        { templateId: "dy-text", templateVersion: "2999.01" },
        "edit",
      ).blocks,
    ).toBe(true);
    expect(
      interpretTemplateStep(
        registry,
        { templateId: "dy-text", templateVersion: TEMPLATE_VERSION },
        "edit",
      ).blocks,
    ).toBe(false);
  });

  it("存在性引用（lane / 窄行）：双缺拦、命中放行带回主语，guard 谓词反向", () => {
    // 本体方向：缺失即本时钟否定（runtime 拒启动 / edit 拒保存 / view 行不可用）
    expect(interpretPresence(false, "runtime")).toEqual({ blocked: true });
    expect(interpretPresence(true, "runtime")).toEqual({
      blocked: false,
      row: true,
    });
    expect(interpretPresence(false, "edit").blocked).toBe(true);
    expect(interpretPresence(true, "edit").blocked).toBe(false);
    expect(interpretPresence(false, "view")).toEqual({ blocked: true });
    expect(interpretPresence(true, "view")).toEqual({
      blocked: false,
      row: true,
    });
    // 谓词方向（删除守卫计数）：有引用即拦删、无引用放行带回谓词值
    expect(interpretPresence(false, "guard")).toEqual({
      blocked: false,
      row: false,
    });
    expect(interpretPresence(true, "guard").blocked).toBe(true);
    // 命中分支带回主语本体：调用侧直接取 row，不再 || !subject 收窄
    const scenario = { id: "scn-1" } as const;
    expect(interpretPresence(scenario, "edit")).toEqual({
      blocked: false,
      row: scenario,
    });
  });
});
