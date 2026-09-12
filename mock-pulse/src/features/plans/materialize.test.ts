import { describe, expect, it } from "vitest";

import type { EventItem } from "@/features/events";
import type { Scenario } from "@/features/scenarios";
import { materializePlanRun } from "./materialize";
import { addLane, createPlan, withPlanFailure } from "./model";

/** 抖音事件（dy-text 模板）：版本载荷为线上 JSON 形态 */
function douyinEvent(): EventItem {
  return {
    id: "evt-dy-1",
    name: "新客问价",
    channelId: "douyin",
    schemaId: "dy-text",
    versions: [
      {
        revision: 1,
        savedAt: "2026-09-12T01:00:00.000Z",
        payload: {
          event: "im_receive_msg",
          client_key: "tt_key",
          from_user_id: "user-1",
          content: { text: "你好，抖音", conversation_type: 1 },
        },
        expected: { status: 200, body: "", bodyMode: "contains" },
      },
    ],
  };
}

function wecomEvent(): EventItem {
  return {
    id: "evt-wc-1",
    name: "企微文本",
    channelId: "wecom",
    schemaId: "wc-text",
    versions: [
      {
        revision: 1,
        savedAt: "2026-09-12T01:00:00.000Z",
        payload: {
          ToUserName: "ww_corp",
          FromUserName: "member1",
          CreateTime: "1348831860",
          MsgType: "text",
          Content: "你好，企业微信",
          MsgId: "7151772163216742434",
          AgentID: "218",
        },
        expected: { status: 200, body: "success", bodyMode: "wecomReply" },
      },
    ],
  };
}

function scenario(
  id: string,
  name: string,
  channelId: Scenario["channelId"],
  steps: { eventId: string; revision: number }[],
): Scenario {
  return { id, name, channelId, steps };
}

const STARTED_AT = "2026-09-12T04:00:00.000Z";

/** 跨渠道两 lane：抖音剧本 + 企微剧本 */
function crossChannelPlan() {
  let plan = createPlan("双平台接待回归", "parallel");
  plan = addLane(plan, "scn-dy");
  plan = addLane(plan, "scn-wc");
  return withPlanFailure(plan, "stop");
}

function crossChannelScenarios(): Scenario[] {
  return [
    scenario("scn-dy", "抖音接待", "douyin", [
      { eventId: "evt-dy-1", revision: 1 },
      { eventId: "evt-dy-1", revision: 1 },
    ]),
    scenario("scn-wc", "企微接待", "wecom", [
      { eventId: "evt-wc-1", revision: 1 },
    ]),
  ];
}

describe("编排快照物化 materializePlanRun", () => {
  it("lane 顺序 = items 顺序；每 lane 经引用解析物化（跨渠道）", () => {
    const plan = crossChannelPlan();
    const snapshot = materializePlanRun({
      plan,
      scenarios: crossChannelScenarios(),
      events: [douyinEvent(), wecomEvent()],
      startedAt: STARTED_AT,
    });

    expect(snapshot.scenarios).toHaveLength(2);
    // lane 0 = 抖音剧本：步骤顺序保持，明文为拼装好的紧凑 JSON
    expect(snapshot.scenarios[0].scenarioId).toBe("scn-dy");
    expect(snapshot.scenarios[0].scenarioName).toBe("抖音接待");
    expect(snapshot.scenarios[0].steps).toHaveLength(2);
    expect(snapshot.scenarios[0].steps[0].channel).toBe("douyin");
    expect(snapshot.scenarios[0].steps[0].body).toContain("你好，抖音");
    // lane 1 = 企微剧本：确定性 XML 明文
    expect(snapshot.scenarios[1].scenarioId).toBe("scn-wc");
    expect(snapshot.scenarios[1].steps[0].channel).toBe("wecom");
    expect(snapshot.scenarios[1].steps[0].body).toContain(
      "<Content><![CDATA[你好，企业微信]]></Content>",
    );
  });

  it("失败策略与执行方式字段透传到快照（Rust 执行器消费）", () => {
    const parallelStop = materializePlanRun({
      plan: crossChannelPlan(),
      scenarios: crossChannelScenarios(),
      events: [douyinEvent(), wecomEvent()],
      startedAt: STARTED_AT,
    });
    expect(parallelStop.mode).toBe("parallel");
    expect(parallelStop.failure).toBe("stop");
    expect(parallelStop.planName).toBe("双平台接待回归");
    expect(parallelStop.planId).toMatch(/^plan-/);
    expect(parallelStop.startedAt).toBe(STARTED_AT);
    expect(parallelStop.runId).toMatch(/^run-/);

    let serial = createPlan("逐平台验收", "serial");
    serial = addLane(serial, "scn-dy");
    const snapshot = materializePlanRun({
      plan: serial,
      scenarios: crossChannelScenarios(),
      events: [douyinEvent()],
      startedAt: STARTED_AT,
    });
    expect(snapshot.mode).toBe("serial");
    expect(snapshot.failure).toBe("continue");
  });

  it("快照隔离：物化后再改编排/剧本不影响快照", () => {
    const plan = crossChannelPlan();
    const scenarios = crossChannelScenarios();
    const snapshot = materializePlanRun({
      plan,
      scenarios,
      events: [douyinEvent(), wecomEvent()],
      startedAt: STARTED_AT,
    });
    const frozen = JSON.stringify(snapshot);

    // 编排换剧本、剧本改名加步骤：已启动的运行不受影响
    plan.items = [{ scenarioId: "scn-wc" }];
    scenarios[0].name = "改名了";
    scenarios[0].steps.push({ eventId: "evt-dy-1", revision: 1 });

    expect(JSON.stringify(snapshot)).toBe(frozen);
    expect(snapshot.scenarios[0].scenarioName).toBe("抖音接待");
  });

  it("空编排拒绝启动（可读错误）", () => {
    expect(() =>
      materializePlanRun({
        plan: createPlan("空编排", "parallel"),
        scenarios: [],
        events: [],
        startedAt: STARTED_AT,
      }),
    ).toThrow(/编排还没有剧本/);
  });

  it("引用的剧本不存在拒绝并指明 lane 序号", () => {
    let plan = createPlan("悬空", "serial");
    plan = addLane(plan, "scn-dy");
    plan = addLane(plan, "scn-gone");
    expect(() =>
      materializePlanRun({
        plan,
        scenarios: crossChannelScenarios(),
        events: [douyinEvent()],
        startedAt: STARTED_AT,
      }),
    ).toThrow(/编排第 2 条引用的剧本不存在：scn-gone/);
  });

  it("lane 内物化失败（剧本无步骤）包装 lane 上下文后抛可读错误", () => {
    const scenarios = [
      scenario("scn-empty", "空剧本", "douyin", []),
      ...crossChannelScenarios(),
    ];
    let plan = createPlan("含空剧本", "parallel");
    plan = addLane(plan, "scn-empty");
    plan = addLane(plan, "scn-dy");

    expect(() =>
      materializePlanRun({
        plan,
        scenarios,
        events: [douyinEvent()],
        startedAt: STARTED_AT,
      }),
    ).toThrow(/剧本「空剧本」（编排第 1 条）无法运行：剧本还没有步骤/);
  });
});
