import { describe, expect, it } from "vitest";

import type { EventItem } from "@/features/events";

import { materializeRunSnapshot } from "./snapshot";

/** 抖音事件（dy-text 模板）：两个版本，载荷为线上 JSON 形态 */
function douyinEvent(versions: number[]): EventItem {
  return {
    id: "evt-dy-1",
    name: "新客问价",
    channelId: "douyin",
    schemaId: "dy-text",
    versions: versions.map((revision) => ({
      revision,
      savedAt: `2026-09-12T0${revision}:00:00.000Z`,
      payload: {
        event: "im_receive_msg",
        client_key: "tt_key",
        from_user_id: `user-${revision}`,
        content: { text: `第${revision}句`, conversation_type: 1 },
      },
      expected: {
        status: 200,
        body: revision === 1 ? "" : "code",
        bodyMode: revision === 1 ? "contains" : "jsonField",
      },
    })),
  };
}

const wecomEvent: EventItem = {
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

const STARTED_AT = "2026-09-12T03:00:00.000Z";

describe("快照物化 materializeRunSnapshot", () => {
  it("抖音剧本：每步产出渠道/事件名/期望/拼装好的紧凑 JSON 明文", () => {
    const other = { ...douyinEvent([1]), id: "evt-dy-2", name: "进入会话" };
    const snapshot = materializeRunSnapshot({
      scenario: {
        id: "scn-1",
        name: "从进入会话到商品咨询",
        channelId: "douyin",
        steps: [
          { eventId: "evt-dy-2", revision: 1 },
          { eventId: "evt-dy-1", revision: 1 },
        ],
      },
      events: [douyinEvent([1]), other],
      startedAt: STARTED_AT,
    });

    expect(snapshot.scenarioId).toBe("scn-1");
    expect(snapshot.scenarioName).toBe("从进入会话到商品咨询");
    expect(snapshot.startedAt).toBe(STARTED_AT);
    expect(snapshot.runId).toMatch(/^run-/);
    expect(snapshot.steps).toHaveLength(2);

    const [first, second] = snapshot.steps;
    expect(first.eventName).toBe("进入会话");
    expect(first.eventId).toBe("evt-dy-2");
    expect(first.channel).toBe("douyin");
    // 明文为 wireBodyText 产出：紧凑 JSON（解析再序列化逐字节一致）
    expect(first.body).toBe(JSON.stringify(JSON.parse(first.body)));
    expect(first.body).toContain('"event":"im_receive_msg"');
    expect(first.body).toContain("第1句");
    // 期望取自引用版本的 expected 快照
    expect(first.expected).toEqual({
      status: 200,
      body: "",
      bodyMode: "contains",
    });
    expect(second.eventName).toBe("新客问价");
  });

  it("企微剧本：每步产出确定性 XML 明文与企微期望", () => {
    const snapshot = materializeRunSnapshot({
      scenario: {
        id: "scn-wc",
        name: "企微剧本",
        channelId: "wecom",
        steps: [{ eventId: "evt-wc-1", revision: 1 }],
      },
      events: [wecomEvent],
      startedAt: STARTED_AT,
    });

    const step = snapshot.steps[0];
    expect(step.channel).toBe("wecom");
    expect(step.body).toContain("<MsgType><![CDATA[text]]></MsgType>");
    expect(step.body).toContain(
      "<Content><![CDATA[你好，企业微信]]></Content>",
    );
    expect(step.expected).toEqual({
      status: 200,
      body: "success",
      bodyMode: "wecomReply",
    });
  });

  it("引用旧版本时按引用版本物化（不追最新版本）", () => {
    const snapshot = materializeRunSnapshot({
      scenario: {
        id: "scn-1",
        name: "引用 v1",
        channelId: "douyin",
        steps: [{ eventId: "evt-dy-1", revision: 1 }],
      },
      events: [douyinEvent([1, 2])],
      startedAt: STARTED_AT,
    });

    expect(snapshot.steps[0].body).toContain("第1句");
    expect(snapshot.steps[0].body).not.toContain("第2句");
    expect(snapshot.steps[0].expected.body).toBe("");
  });

  it("隔离：物化后再改事件/剧本不影响快照内容", () => {
    const event = douyinEvent([1, 2]);
    const scenario = {
      id: "scn-1",
      name: "隔离验证",
      channelId: "douyin" as const,
      steps: [{ eventId: "evt-dy-1", revision: 1 }],
    };
    const snapshot = materializeRunSnapshot({
      scenario,
      events: [event],
      startedAt: STARTED_AT,
    });
    const frozen = JSON.stringify(snapshot);

    // 事件追加新版本、改名；剧本改名、改步骤
    event.versions.push({
      revision: 3,
      savedAt: "2026-09-12T04:00:00.000Z",
      payload: { event: "im_receive_msg", content: { text: "第3句" } },
      expected: { status: 404, body: "x", bodyMode: "equals" },
    });
    event.name = "改名了";
    scenario.name = "剧本也改名了";
    scenario.steps.push({ eventId: "evt-dy-1", revision: 3 });

    expect(JSON.stringify(snapshot)).toBe(frozen);
    expect(snapshot.scenarioName).toBe("隔离验证");
    expect(snapshot.steps).toHaveLength(1);
    expect(snapshot.steps[0].body).toContain("第1句");
  });

  it("空步骤拒绝启动（可读错误）", () => {
    expect(() =>
      materializeRunSnapshot({
        scenario: {
          id: "scn-empty",
          name: "空剧本",
          channelId: "douyin",
          steps: [],
        },
        events: [],
        startedAt: STARTED_AT,
      }),
    ).toThrow(/剧本还没有步骤/);
  });

  it("悬空引用（事件已不在素材库）拒绝并指明步骤序号", () => {
    expect(() =>
      materializeRunSnapshot({
        scenario: {
          id: "scn-x",
          name: "悬空",
          channelId: "douyin",
          steps: [
            { eventId: "evt-dy-1", revision: 1 },
            { eventId: "evt-gone", revision: 1 },
          ],
        },
        events: [douyinEvent([1])],
        startedAt: STARTED_AT,
      }),
    ).toThrow(/第 2 步引用的事件不存在：evt-gone/);
  });

  it("引用的版本号不存在拒绝（可读错误）", () => {
    expect(() =>
      materializeRunSnapshot({
        scenario: {
          id: "scn-x",
          name: "缺版本",
          channelId: "douyin",
          steps: [{ eventId: "evt-dy-1", revision: 9 }],
        },
        events: [douyinEvent([1, 2])],
        startedAt: STARTED_AT,
      }),
    ).toThrow(/第 1 步引用的版本不存在：新客问价 v9/);
  });

  it("跨渠道步骤防御性拒绝（正常流程已被领域层拦下）", () => {
    expect(() =>
      materializeRunSnapshot({
        scenario: {
          id: "scn-x",
          name: "混渠道",
          channelId: "douyin",
          steps: [{ eventId: "evt-wc-1", revision: 1 }],
        },
        events: [wecomEvent],
        startedAt: STARTED_AT,
      }),
    ).toThrow(/第 1 步引用了企业微信的事件/);
  });
});
