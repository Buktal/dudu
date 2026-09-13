import { describe, expect, it } from "vitest";

import type { EventItem } from "@/features/events";

import {
  addStep,
  assertChannelEditable,
  changeChannel,
  createScenario,
  moveStep,
  removeStep,
  type Scenario,
  scenariosReferencingEvent,
  validateScenario,
  withStepRevision,
} from "./model";

const douyinEvent: Pick<EventItem, "id" | "channelId"> = {
  id: "evt-dy-1",
  channelId: "douyin",
};

const wecomEvent: Pick<EventItem, "id" | "channelId"> = {
  id: "evt-wc-1",
  channelId: "wecom",
};

/** 两渠道各一条带版本的事件（引用解析的独立事实源） */
function library(): EventItem[] {
  const version = (revision: number, text: string) => ({
    revision,
    savedAt: `2026-09-12T0${revision}:00:00.000Z`,
    payload: { event: "im_receive_msg", content: { text } },
    expected: { status: 200, body: "", bodyMode: "contains" as const },
  });
  return [
    {
      id: "evt-dy-1",
      name: "新客问价",
      channelId: "douyin",
      schemaId: "dy-text",
      versions: [version(1, "第一句"), version(2, "第二句")],
    },
    {
      id: "evt-wc-1",
      name: "企微文本",
      channelId: "wecom",
      schemaId: "wc-text",
      versions: [version(1, "你好")],
    },
  ];
}

describe("剧本模型基础", () => {
  it("新建剧本带渠道且步骤为空", () => {
    const scenario = createScenario("从进入到咨询", "douyin");
    expect(scenario.steps).toEqual([]);
    expect(scenario.channelId).toBe("douyin");
    expect(scenario.name).toBe("从进入到咨询");
    expect(scenario.id).toMatch(/^scn-/);
  });

  it("两个新建剧本 id 不同", () => {
    expect(createScenario("a", "douyin").id).not.toBe(
      createScenario("b", "douyin").id,
    );
  });
});

describe("渠道锁定（ADR-0004 禁混写）", () => {
  it("添加他渠道事件在领域层被拒绝，错误可读且包含双方渠道名", () => {
    const scenario = createScenario("抖音接待", "douyin");
    expect(() => addStep(scenario, { ...wecomEvent, revision: 1 })).toThrow(
      /剧本渠道已锁定为抖音.*企业微信/,
    );
  });

  it("被拒绝后剧本不变；同渠道事件可正常追加", () => {
    const scenario = createScenario("抖音接待", "douyin");
    let kept = scenario;
    try {
      kept = addStep(scenario, { ...wecomEvent, revision: 1 });
    } catch {
      // 领域层拒绝：调用方状态不变
    }
    expect(kept).toBe(scenario);

    const next = addStep(scenario, { ...douyinEvent, revision: 2 });
    expect(next.steps).toEqual([{ eventId: "evt-dy-1", revision: 2, wait: 0 }]);
  });

  it("无步骤时可换渠道；添加第一步后渠道锁定", () => {
    let scenario = createScenario("未定渠道", "douyin");
    scenario = changeChannel(scenario, "wecom");
    expect(scenario.channelId).toBe("wecom");

    scenario = addStep(scenario, { ...wecomEvent, revision: 1 });
    expect(() => assertChannelEditable(scenario)).toThrow(/渠道锁定为企业微信/);
    expect(() => changeChannel(scenario, "douyin")).toThrow(/渠道锁定/);
  });

  it("同一事件可重复添加（步骤按位置而非事件区分）", () => {
    let scenario = createScenario("重复发送", "douyin");
    scenario = addStep(scenario, { ...douyinEvent, revision: 1 });
    scenario = addStep(scenario, { ...douyinEvent, revision: 2 });
    expect(scenario.steps).toHaveLength(2);
    expect(scenario.steps[0]).toEqual({
      eventId: "evt-dy-1",
      revision: 1,
      wait: 0,
    });
    expect(scenario.steps[1]).toEqual({
      eventId: "evt-dy-1",
      revision: 2,
      wait: 0.6,
    });
  });
});

describe("步骤调序与删除", () => {
  function twoSteps(): Scenario {
    let scenario = createScenario("两步", "douyin");
    scenario = addStep(scenario, { ...douyinEvent, revision: 1 });
    scenario = addStep(scenario, {
      id: "evt-dy-2",
      channelId: "douyin",
      revision: 1,
    });
    return scenario;
  }

  it("下移第一步与上移第二步都交换为 [2,1]", () => {
    expect(twoSteps().steps.map((step) => step.eventId)).toEqual([
      "evt-dy-1",
      "evt-dy-2",
    ]);
    const movedDown = moveStep(twoSteps(), 0, 1);
    expect(movedDown.steps.map((step) => step.eventId)).toEqual([
      "evt-dy-2",
      "evt-dy-1",
    ]);
    const movedUp = moveStep(movedDown, 1, -1);
    expect(movedUp.steps.map((step) => step.eventId)).toEqual([
      "evt-dy-1",
      "evt-dy-2",
    ]);
  });

  it("首步上移与末步下移为无操作（原样返回）", () => {
    const scenario = twoSteps();
    expect(moveStep(scenario, 0, -1)).toBe(scenario);
    expect(moveStep(scenario, 1, 1)).toBe(scenario);
  });

  it("按位置删除步骤，其余保持顺序", () => {
    const removed = removeStep(twoSteps(), 0);
    expect(removed.steps.map((step) => step.eventId)).toEqual(["evt-dy-2"]);
    expect(removeStep(removed, 5)).toBe(removed);
  });
});

describe("版本引用与显式同步", () => {
  it("步骤只存引用（事件 id + 版本号），不复制载荷与渠道", () => {
    let scenario = createScenario("引用", "douyin");
    scenario = addStep(scenario, { ...douyinEvent, revision: 1 });
    expect(scenario.steps[0]).toEqual({
      eventId: "evt-dy-1",
      revision: 1,
      wait: 0,
    });
    expect("payload" in (scenario.steps[0] as object)).toBe(false);
    expect("group" in (scenario.steps[0] as object)).toBe(false);
  });

  it("显式同步把指定步骤引用更新到新版本号，其余步骤不动", () => {
    let scenario = createScenario("同步", "douyin");
    scenario = addStep(scenario, { ...douyinEvent, revision: 1 });
    scenario = addStep(scenario, {
      id: "evt-dy-2",
      channelId: "douyin",
      revision: 1,
    });
    const synced = withStepRevision(scenario, 0, 2);
    expect(synced.steps[0]?.revision).toBe(2);
    expect(synced.steps[1]?.revision).toBe(1);
  });
});

describe("保存前整体校验（防绕过 addStep 的路径）", () => {
  it("合法剧本通过", () => {
    let scenario = createScenario("合法", "douyin");
    scenario = addStep(scenario, { ...douyinEvent, revision: 2 });
    expect(() => validateScenario(scenario, library())).not.toThrow();
  });

  it("直接构造出的跨渠道步骤在保存时被拒绝", () => {
    const smuggled: Scenario = {
      id: "scn-x",
      name: "走私",
      channelId: "douyin",
      steps: [{ eventId: "evt-wc-1", revision: 1 }],
    };
    expect(() => validateScenario(smuggled, library())).toThrow(
      /剧本渠道为抖音，步骤引用了企业微信的事件/,
    );
  });

  it("引用不存在的事件（悬空）被拒绝", () => {
    const dangling: Scenario = {
      id: "scn-x",
      name: "悬空",
      channelId: "douyin",
      steps: [{ eventId: "evt-gone", revision: 1 }],
    };
    expect(() => validateScenario(dangling, library())).toThrow(
      /引用的事件不存在：evt-gone/,
    );
  });
});

describe("事件删除守卫", () => {
  it("返回引用了该事件的剧本（删除方据此拒绝）；未引用返回空", () => {
    let quoting = createScenario("引用者", "douyin");
    quoting = addStep(quoting, { ...douyinEvent, revision: 1 });
    const other = createScenario("不引用", "wecom");

    const referencing = scenariosReferencingEvent("evt-dy-1", [quoting, other]);
    expect(referencing.map((scenario) => scenario.id)).toEqual([quoting.id]);

    expect(scenariosReferencingEvent("evt-wc-1", [quoting, other])).toEqual([]);
  });
});
