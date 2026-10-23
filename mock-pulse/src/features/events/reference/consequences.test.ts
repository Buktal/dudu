import { describe, expect, it } from "vitest";

import { materializePlanRun } from "@/features/plans/materialize";
import {
  addLane,
  createPlan,
  plansReferencingScenario,
  validatePlan,
} from "@/features/plans/model";
import { planStats } from "@/features/plans/selectors";
import {
  materializeRunSnapshot,
  type SnapshotStep,
} from "@/features/runs/snapshot";
import {
  type Scenario,
  scenariosReferencingEvent,
  validateScenario,
} from "@/features/scenarios/model";
import { resolveSteps } from "@/features/scenarios/selectors";
import type { EventItem } from "../model";
import { schemaById } from "../schemas";
import {
  REF_CONSEQUENCES,
  refEntryOf,
  refRowOf,
  refStatusForPresence,
} from "./consequences";
import {
  interpretEventStep,
  interpretPresence,
  interpretTemplateStep,
} from "./interpret";
import { describeEventVersion, describeTemplateVersion } from "./resolve";

/**
 * consequence 表行为钉住（C5）：每 status × 时钟一行，断言的都是
 * 从当前代码核验出的实际语义（无行为变更）——
 * - runtime：两种缺失都拒绝启动（文案见各时钟既有测试）；
 * - view：事件 version-missing 带回行故不标 missing（行照常展示），
 *   模板 version-missing 与 id-missing 同标 missing（无条目即缺）；
 * - edit：事件保存只看行存在（超前 revision 存得下、运行时再拦），
 *   模板保存两种缺失都拦；
 * - guard：事件引用按 id 匹配（落后 revision 同样拦删）。
 */

const STARTED_AT = "2026-09-12T03:00:00.000Z";

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

function scenarioWith(steps: Scenario["steps"], id = "scn-1"): Scenario {
  return { id, name: "剧本", channelId: "douyin", steps };
}

const TEMPLATE_VERSION = schemaById("dy-text").version;

describe("consequence 表本体：每 status 一行（runtime / view / edit / guard）", () => {
  it("ok：全时钟放行（guard 有引用即拦删）", () => {
    expect(REF_CONSEQUENCES.ok).toMatchObject({
      runtime: { blocks: false, missingKind: null },
      view: { hasRow: true, hasEntry: true, mayOutdate: true },
      edit: {
        eventBlocksSave: false,
        templateBlocksSave: false,
        laneBlocksSave: false,
      },
      guard: { eventBlocksDelete: true, laneBlocksDelete: true },
    });
  });

  it("id-missing：全时钟拦截（guard 无引用可拦故放行）", () => {
    expect(REF_CONSEQUENCES["id-missing"]).toMatchObject({
      runtime: { blocks: true, missingKind: "id" },
      view: { hasRow: false, hasEntry: false, mayOutdate: false },
      edit: {
        eventBlocksSave: true,
        templateBlocksSave: true,
        laneBlocksSave: true,
      },
      guard: { eventBlocksDelete: false, laneBlocksDelete: false },
    });
  });

  it("version-missing：runtime 拦、view 留行、edit 事件放行模板拦、guard 事件拦", () => {
    expect(REF_CONSEQUENCES["version-missing"]).toMatchObject({
      runtime: { blocks: true, missingKind: "version" },
      view: { hasRow: true, hasEntry: false, mayOutdate: false },
      edit: {
        eventBlocksSave: false,
        templateBlocksSave: true,
        laneBlocksSave: false,
      },
      guard: { eventBlocksDelete: true, laneBlocksDelete: false },
    });
  });

  it("存在性映射：有即 ok、无即 id-missing（lane 与守卫计数经此查表）", () => {
    expect(refStatusForPresence(true)).toBe("ok");
    expect(refStatusForPresence(false)).toBe("id-missing");
    expect(REF_CONSEQUENCES[refStatusForPresence(true)].runtime.blocks).toBe(
      false,
    );
    expect(REF_CONSEQUENCES[refStatusForPresence(false)].runtime.blocks).toBe(
      true,
    );
  });

  it("行/条目取数与 kernel 一致：ok 双带回、id-missing 双无、version-missing 只带回行", () => {
    const events = [douyinEvent([1])];
    const ok = describeEventVersion(events, {
      eventId: "evt-dy-1",
      revision: 1,
    });
    expect(refRowOf(ok)?.id).toBe("evt-dy-1");
    expect(refEntryOf(ok)?.revision).toBe(1);

    const idMissing = describeEventVersion(events, {
      eventId: "evt-gone",
      revision: 1,
    });
    expect(refRowOf(idMissing)).toBeUndefined();
    expect(refEntryOf(idMissing)).toBeUndefined();

    const versionMissing = describeEventVersion(events, {
      eventId: "evt-dy-1",
      revision: 9,
    });
    expect(refRowOf(versionMissing)?.id).toBe("evt-dy-1");
    expect(refEntryOf(versionMissing)).toBeUndefined();

    const templateOk = describeTemplateVersion(
      [{ id: "dy-text", version: TEMPLATE_VERSION }],
      { templateId: "dy-text", templateVersion: TEMPLATE_VERSION },
    );
    expect(refEntryOf(templateOk)).toBeDefined();
    const templateMissing = describeTemplateVersion(
      [{ id: "dy-text", version: TEMPLATE_VERSION }],
      { templateId: "dy-text", templateVersion: "2999.01" },
    );
    expect(refEntryOf(templateMissing)).toBeUndefined();
  });
});

describe("runtime 时钟问表（拒绝启动，文案不变）", () => {
  function snapshotWith(steps: SnapshotStep[]) {
    return materializeRunSnapshot({
      scenario: {
        id: "scn-1",
        name: "剧本",
        channelId: "douyin",
        steps,
      },
      events: [douyinEvent([1, 2])],
      templates: [schemaById("dy-text")],
      startedAt: STARTED_AT,
    });
  }

  it("ok（事件/模板）：正常物化", () => {
    const snapshot = snapshotWith([
      { eventId: "evt-dy-1", revision: 1 },
      { templateId: "dy-text", templateVersion: TEMPLATE_VERSION },
    ]);
    expect(snapshot.steps).toHaveLength(2);
  });

  it("事件 id-missing：拒绝并指明步骤与事件 id", () => {
    expect(() => snapshotWith([{ eventId: "evt-gone", revision: 1 }])).toThrow(
      /第 1 步引用的事件不存在：evt-gone/,
    );
  });

  it("事件 version-missing：拒绝并指明事件名与版本", () => {
    expect(() => snapshotWith([{ eventId: "evt-dy-1", revision: 9 }])).toThrow(
      /第 1 步引用的版本不存在：新客问价 v9/,
    );
  });

  it("模板 id-missing：拒绝并指明模板 id", () => {
    expect(() =>
      snapshotWith([
        { templateId: "dy-gone", templateVersion: TEMPLATE_VERSION },
      ]),
    ).toThrow(/第 1 步引用的内置模板不存在：dy-gone/);
  });

  it("模板 version-missing：拒绝并指明模板名与版本", () => {
    expect(() =>
      snapshotWith([{ templateId: "dy-text", templateVersion: "2999.01" }]),
    ).toThrow(/第 1 步引用的模板版本不存在：.*v2999\.01/);
  });

  it("lane 双缺：拒绝并指明 lane 序号；有快照时按快照启动（快照优先）", () => {
    const missing = addLane(createPlan("悬空", "serial"), "scn-gone");
    expect(() =>
      materializePlanRun({
        plan: missing,
        scenarios: [],
        events: [douyinEvent([1])],
        startedAt: STARTED_AT,
      }),
    ).toThrow(/编排第 1 条引用的剧本不存在：scn-gone/);

    const snapshot: Scenario = {
      id: "scn-gone",
      name: "已删剧本的遗留快照",
      channelId: "douyin",
      steps: [{ eventId: "evt-dy-1", revision: 1 }],
    };
    const pinned = addLane(createPlan("遗留", "serial"), "scn-gone", snapshot);
    const planSnapshot = materializePlanRun({
      plan: pinned,
      scenarios: [],
      events: [douyinEvent([1])],
      startedAt: STARTED_AT,
    });
    expect(planSnapshot.scenarios[0]?.scenarioId).toBe("scn-gone");
  });
});

describe("view 时钟问表（标记语义不变）", () => {
  it("事件 ok 且落后：missing 为假、outdated 为真", () => {
    const rows = resolveSteps(
      [{ eventId: "evt-dy-1", revision: 1 }],
      [douyinEvent([1, 2])],
    );
    expect(rows[0]?.missing).toBe(false);
    expect(rows[0]?.outdated).toBe(true);
    expect(rows[0]?.referenced?.revision).toBe(1);
  });

  it("事件 id-missing：missing 为真、行与版本皆无", () => {
    const rows = resolveSteps(
      [{ eventId: "evt-gone", revision: 1 }],
      [douyinEvent([1])],
    );
    expect(rows[0]?.missing).toBe(true);
    expect(rows[0]?.outdated).toBe(false);
    expect(rows[0]?.event).toBeUndefined();
    expect(rows[0]?.referenced).toBeUndefined();
  });

  it("事件 version-missing：不标 missing（行照常展示）、outdated 为假、版本无", () => {
    const rows = resolveSteps(
      [{ eventId: "evt-dy-1", revision: 9 }],
      [douyinEvent([1, 2])],
    );
    expect(rows[0]?.missing).toBe(false);
    expect(rows[0]?.outdated).toBe(false);
    expect(rows[0]?.event?.id).toBe("evt-dy-1");
    expect(rows[0]?.referenced).toBeUndefined();
  });

  it("模板 ok：不标 missing；两种缺失同样标 missing", () => {
    const registry = [schemaById("dy-text")];
    const ok = resolveSteps(
      [{ templateId: "dy-text", templateVersion: TEMPLATE_VERSION }],
      [],
      registry,
    );
    expect(ok[0]?.missing).toBe(false);

    const idMissing = resolveSteps(
      [{ templateId: "dy-gone", templateVersion: TEMPLATE_VERSION }],
      [],
      registry,
    );
    expect(idMissing[0]?.missing).toBe(true);

    const versionMissing = resolveSteps(
      [{ templateId: "dy-text", templateVersion: "2999.01" }],
      [],
      registry,
    );
    expect(versionMissing[0]?.missing).toBe(true);
    expect(versionMissing[0]?.template).toBeUndefined();
  });

  it("编排统计：未解析 lane（id-missing）不计入", () => {
    expect(
      planStats([{ channelId: "douyin" as const, steps: [{}, {}] }, undefined]),
    ).toEqual({ platformCount: 1, eventCount: 2 });
  });
});

describe("edit 时钟问表（保存/同步门不变）", () => {
  it("事件 id-missing：保存拒绝；version-missing（超前 revision）保存放行", () => {
    const dangling = scenarioWith([{ eventId: "evt-gone", revision: 1 }]);
    expect(() => validateScenario(dangling, [douyinEvent([1])])).toThrow(
      /步骤引用的事件不存在：evt-gone/,
    );
    // 实际语义：validateScenario 不检查 revision，超前引用存得下，
    // 运行时钟再拒绝（见 runtime 行）。
    const ahead = scenarioWith([{ eventId: "evt-dy-1", revision: 9 }]);
    expect(() => validateScenario(ahead, [douyinEvent([1, 2])])).not.toThrow();
  });

  it("模板两种缺失：保存都拒绝（文案区分未注册 id / 超前版本）", () => {
    const registry = [
      { id: "dy-text", channelId: "douyin", version: "2026.09" },
    ] as const;
    const idMissing = scenarioWith([
      { templateId: "dy-gone", templateVersion: "2026.09" },
    ]);
    expect(() =>
      validateScenario(idMissing, [douyinEvent([1])], [...registry]),
    ).toThrow(/步骤引用的内置模板不存在：dy-gone/);

    const versionMissing = scenarioWith([
      { templateId: "dy-text", templateVersion: "2999.01" },
    ]);
    expect(() =>
      validateScenario(versionMissing, [douyinEvent([1])], [...registry]),
    ).toThrow(/步骤引用的内置模板版本不存在：dy-text v2999\.01/);
  });

  it("lane：库内命中保存放行，双缺保存拒绝", () => {
    const ok = addLane(createPlan("回归", "serial"), "scn-1");
    expect(() => validatePlan(ok, [{ id: "scn-1" }])).not.toThrow();
    const missing = addLane(createPlan("悬空", "serial"), "scn-gone");
    expect(() => validatePlan(missing, [{ id: "scn-1" }])).toThrow(
      /第 1 条引用的剧本不存在：scn-gone/,
    );
  });

  it("同步门：无行拒绝（id-missing），落后引用可同步（version-missing/ok 放行）", () => {
    // 同步是纯存在性判定，共用 lane 列（两态同值，无独立列）
    expect(
      REF_CONSEQUENCES[refStatusForPresence(false)].edit.laneBlocksSave,
    ).toBe(true);
    expect(
      REF_CONSEQUENCES[refStatusForPresence(true)].edit.laneBlocksSave,
    ).toBe(false);
    // 实现侧：scenarios-slice latestVersionOf 无行抛「事件不存在」，
    // 落后引用走 withStepRevision 前进（既有 slice 测试钉住同步成功与悬空拒绝）。
  });
});

describe("guard 问表（拦删语义不变）", () => {
  it("落后 revision 的步骤仍算引用事件：拦删（version-missing 行在）", () => {
    const quoting = scenarioWith([{ eventId: "evt-dy-1", revision: 9 }]);
    expect(
      scenariosReferencingEvent("evt-dy-1", [quoting]).map(
        (scenario) => scenario.id,
      ),
    ).toEqual(["scn-1"]);
    expect(REF_CONSEQUENCES["version-missing"].guard.eventBlocksDelete).toBe(
      true,
    );
  });

  it("lane 按 scenarioId 匹配：快照内容无关，有引用即拦删", () => {
    const snapshot: Scenario = {
      id: "scn-1",
      name: "选入时的旧快照",
      channelId: "douyin",
      steps: [],
    };
    const plan = addLane(createPlan("回归", "parallel"), "scn-1", snapshot);
    const names = plansReferencingScenario("scn-1", [plan]).map(
      (item) => item.name,
    );
    expect(names).toEqual(["回归"]);
    expect(plansReferencingScenario("scn-gone", [plan])).toEqual([]);
  });
});

/**
 * interpreter 单点断言（C1）：调用时钟只传引用与时钟，{row, entry, blocks,
 * missingKind, missing, outdated} 一次给齐——替代五处重复的 status 分岔测试。
 * 期望值与上方各时钟行为测试逐字对齐（只换消费口径，不换语义）。
 */
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
    expect(interpretPresence(false, "view").blocked).toBe(true);
    expect(interpretPresence(true, "view").blocked).toBe(false);
    // 谓词方向（删除守卫计数）：有引用即拦删、无引用放行
    expect(interpretPresence(false, "guard").blocked).toBe(false);
    expect(interpretPresence(true, "guard").blocked).toBe(true);
    // 命中分支带回主语本体：调用侧直接取 row，不再 || !subject 收窄
    const scenario = { id: "scn-1" } as const;
    expect(interpretPresence(scenario, "edit")).toEqual({
      blocked: false,
      row: scenario,
    });
  });
});
