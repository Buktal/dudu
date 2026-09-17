import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ConnectionConfig } from "@/features/connections";
import type { ChannelId } from "@/lib/channels";

import * as api from "../api";
import type { RunStep } from "../model";
import {
  foldProjectedOutcome,
  type LaunchStore,
  launchDirectRun,
  launchProjectedRun,
} from "./launch";
import { type LiveRun, liveCleared, liveStarted } from "./live";

vi.mock("../api", () => ({
  loadRuns: vi.fn(),
  saveRun: vi.fn(),
  dispatchDirect: vi.fn(),
  startScenarioRun: vi.fn(),
  stopRun: vi.fn(),
}));

const apiMock = vi.mocked(api, true);

const CONNECTION: ConnectionConfig = {
  channel: "douyin",
  url: "http://127.0.0.1:9999/webhooks/douyin",
  clientKey: "tt_key",
  clientSecret: "tt_secret",
  system: "dop",
  miniGameToken: "",
  isvToken: "",
  isvKey: "",
};

/** 启动编排所需的最小 store 替身：连接表可注入，dispatch 只记录 action */
function makeStore(items: Record<string, ConnectionConfig> = {}) {
  const dispatch = vi.fn();
  const store: LaunchStore = {
    getState: () => ({
      runs: {
        phase: "idle" as const,
        scenarioRunPhase: "idle" as const,
        live: null,
      },
      plans: { planRunPhase: "idle" as const },
      connections: { items },
    }),
    dispatch,
  };
  return { store, dispatch };
}

function compileDouyin() {
  return {
    channel: "douyin" as ChannelId,
    body: '{"event":"im_receive_msg"}',
    eventName: "新客问价",
    eventId: "evt-001",
    expected: { status: 200, body: "", bodyMode: "contains" as const },
  };
}

/** Rust 直发命令返回的成品单步快照（期望比对已在 Rust 完成） */
function directStep(overrides: Partial<RunStep> = {}): RunStep {
  return {
    eventName: "新客问价",
    eventId: "evt-001",
    channel: "douyin",
    url: CONNECTION.url,
    payload: '{"event":"im_receive_msg"}',
    requestBody: '{"event":"im_receive_msg"}',
    expected: { status: 200, body: "", bodyMode: "contains" },
    signature: "a".repeat(40),
    msgId: "m-1",
    receipt: { status: 200, elapsedMs: 12, body: '{"code":0}', error: null },
    verdict: { passed: true, reason: "HTTP 200，与期望状态一致" },
    ...overrides,
  };
}

function liveFixture(runId = "run-x1"): LiveRun {
  return {
    runId,
    kind: "scenario",
    name: "抖音接待",
    mode: "serial",
    startedAt: "2026-09-12T03:00:00.000Z",
    lanes: [
      {
        name: "抖音接待",
        channel: "douyin",
        steps: [{ eventName: "新客问价", status: "pending" }],
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("启动编排直测：直发（launchDirectRun）", () => {
  it("无草稿（compile null）→ noop，不发 dispatch、不调命令", async () => {
    const { store, dispatch } = makeStore({ douyin: CONNECTION });

    const outcome = await launchDirectRun(() => null, store);

    expect(outcome).toEqual({ kind: "noop" });
    expect(dispatch).not.toHaveBeenCalled();
    expect(apiMock.dispatchDirect).not.toHaveBeenCalled();
    expect(apiMock.saveRun).not.toHaveBeenCalled();
  });

  it("缺连接条目 → needConnection（恒带缺失渠道），不调命令", async () => {
    const { store, dispatch } = makeStore();

    const outcome = await launchDirectRun(compileDouyin, store);

    expect(outcome).toEqual({ kind: "needConnection", channels: ["douyin"] });
    expect(dispatch).not.toHaveBeenCalled();
    expect(apiMock.dispatchDirect).not.toHaveBeenCalled();
    expect(apiMock.saveRun).not.toHaveBeenCalled();
  });

  it("连接未就绪（凭据为空）→ needConnection，不调命令", async () => {
    const { store } = makeStore({
      douyin: { ...CONNECTION, clientKey: "", clientSecret: "" },
    });

    const outcome = await launchDirectRun(compileDouyin, store);

    expect(outcome).toEqual({ kind: "needConnection", channels: ["douyin"] });
    expect(apiMock.dispatchDirect).not.toHaveBeenCalled();
    expect(apiMock.saveRun).not.toHaveBeenCalled();
  });

  it("门禁通过 → invoke → 落盘 → done（run/result 与 invoke runId 一致）", async () => {
    const { store, dispatch } = makeStore({ douyin: CONNECTION });
    const step = directStep();
    apiMock.dispatchDirect.mockResolvedValueOnce({ step, cancelled: false });
    apiMock.saveRun.mockImplementationOnce(async (run) => [run]);

    const outcome = await launchDirectRun(compileDouyin, store);

    expect(outcome.kind).toBe("done");
    if (outcome.kind !== "done") return;
    // 先记账后发送：directStarted 携带 runId，命令载荷复用同一 runId
    const started = dispatch.mock.calls[0]?.[0];
    expect(liveStarted.match(started)).toBe(false);
    expect(started).toMatchObject({
      type: "runs/directStarted",
      payload: { runId: outcome.run.id },
    });
    const call = apiMock.dispatchDirect.mock.calls[0];
    expect(call?.[0]).toEqual(CONNECTION);
    expect(call?.[1]).toMatchObject({
      body: '{"event":"im_receive_msg"}',
      eventName: "新客问价",
      eventId: "evt-001",
      runId: outcome.run.id,
    });
    const saved = apiMock.saveRun.mock.calls[0]?.[0];
    expect(saved?.id).toBe(outcome.run.id);
    expect(saved?.steps).toEqual([step]);
    expect(outcome.run.steps).toEqual([step]);
    expect(outcome.result).toMatchObject({
      eventId: "evt-001",
      runId: outcome.run.id,
    });
    expect(outcome.persistenceError).toBeUndefined();
  });

  it("落盘失败 → done 仍带完整快照，persistenceError 随结果返回", async () => {
    const { store } = makeStore({ douyin: CONNECTION });
    apiMock.dispatchDirect.mockResolvedValueOnce({
      step: directStep(),
      cancelled: false,
    });
    apiMock.saveRun.mockRejectedValueOnce("磁盘暂不可写");

    const outcome = await launchDirectRun(compileDouyin, store);

    expect(outcome.kind).toBe("done");
    if (outcome.kind !== "done") return;
    expect(outcome.run.steps[0].receipt.status).toBe(200);
    expect(outcome.persistenceError).toBe("磁盘暂不可写");
  });

  it("invoke 抛错 → 原样抛出，不落盘", async () => {
    const { store } = makeStore({ douyin: CONNECTION });
    apiMock.dispatchDirect.mockRejectedValueOnce(new Error("命令执行失败"));

    await expect(launchDirectRun(compileDouyin, store)).rejects.toThrow(
      "命令执行失败",
    );
    expect(apiMock.saveRun).not.toHaveBeenCalled();
  });
});

describe("启动编排直测：投影（launchProjectedRun）", () => {
  it("缺连接 → needConnection，不物化不调 invoke", async () => {
    const { store, dispatch } = makeStore();
    const materialize = vi.fn();
    const toLive = vi.fn();
    const invoke = vi.fn();

    const outcome = await launchProjectedRun(
      { channels: ["douyin"], materialize, toLive, invoke },
      store,
    );

    expect(outcome).toEqual({ kind: "needConnection", channels: ["douyin"] });
    expect(materialize).not.toHaveBeenCalled();
    expect(toLive).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("门禁先行：缺连接 + 坏 materialize → needConnection，不抛错", async () => {
    const { store } = makeStore();
    const materialize = vi.fn(() => {
      throw new Error("找不到要发送的步骤。");
    });
    const invoke = vi.fn();

    const outcome = await launchProjectedRun(
      {
        channels: ["douyin"],
        materialize,
        toLive: liveFixture,
        invoke,
      },
      store,
    );

    expect(outcome).toEqual({ kind: "needConnection", channels: ["douyin"] });
    // 门禁在物化之前：坏快照的错误被门禁截断，不抛给调用方
    expect(materialize).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("门禁通过 → 物化 → 投影 → invoke → started（连接按门禁解析传参）", async () => {
    const order: string[] = [];
    const dispatch = vi.fn((action: unknown) => {
      if (liveStarted.match(action)) order.push("liveStarted");
      return action;
    });
    const store: LaunchStore = {
      getState: () => ({
        runs: {
          phase: "idle" as const,
          scenarioRunPhase: "idle" as const,
          live: null,
        },
        plans: { planRunPhase: "idle" as const },
        connections: { items: { douyin: CONNECTION } },
      }),
      dispatch,
    };
    const snapshot = { runId: "snap-1", tag: "s" };
    const live = liveFixture("run-x1");
    const invoke = vi.fn(async () => {
      order.push("invoke");
      return "run-x1";
    });

    const outcome = await launchProjectedRun(
      {
        channels: ["douyin"],
        materialize: () => {
          order.push("materialize");
          return snapshot;
        },
        toLive: (input) => {
          order.push("toLive");
          expect(input).toBe(snapshot);
          return live;
        },
        invoke: (input, connections) => {
          expect(input).toBe(snapshot);
          expect(connections).toEqual([CONNECTION]);
          return invoke();
        },
      },
      store,
    );

    expect(outcome).toEqual({ kind: "started", live });
    // 调用顺序：门禁 → 物化 → 投影 →（投影先行）→ invoke
    expect(order).toEqual(["materialize", "toLive", "liveStarted", "invoke"]);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("invoke 失败 → 撤回投影（liveCleared）后原样抛出", async () => {
    const { store, dispatch } = makeStore({ douyin: CONNECTION });
    const live = liveFixture("run-x1");

    await expect(
      launchProjectedRun(
        {
          channels: ["douyin"],
          materialize: () => ({ runId: "snap-1" }),
          toLive: () => live,
          invoke: async () => {
            throw new Error("命令执行失败");
          },
        },
        store,
      ),
    ).rejects.toThrow("命令执行失败");

    expect(liveStarted.match(dispatch.mock.calls[0]?.[0])).toBe(true);
    const cleared = dispatch.mock.calls[1]?.[0];
    expect(liveCleared.match(cleared)).toBe(true);
    if (liveCleared.match(cleared)) {
      expect(cleared.payload).toEqual({ runId: live.runId });
    }
  });

  it("物化失败 → 原样抛出，不投影不调 invoke", async () => {
    const { store, dispatch } = makeStore({ douyin: CONNECTION });
    const toLive = vi.fn(liveFixture);
    const invoke = vi.fn();

    await expect(
      launchProjectedRun(
        {
          channels: ["douyin"],
          materialize: () => {
            throw new Error("第 1 步引用的事件不存在：evt-gone。");
          },
          toLive,
          invoke,
        },
        store,
      ),
    ).rejects.toThrow("第 1 步引用的事件不存在：evt-gone。");
    expect(toLive).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("投影 outcome 折叠（foldProjectedOutcome）", () => {
  it("noop → idle", () => {
    expect(foldProjectedOutcome({ kind: "noop" }, "run-x1", "running")).toEqual(
      { phase: "idle" },
    );
  });

  it("needConnection → needConnection 并带出缺失渠道", () => {
    expect(
      foldProjectedOutcome(
        { kind: "needConnection", channels: ["wecom"] },
        null,
        "starting",
      ),
    ).toEqual({ phase: "needConnection", channels: ["wecom"] });
  });

  it("started + 在途一致 → running", () => {
    const live = liveFixture("run-x1");
    expect(
      foldProjectedOutcome({ kind: "started", live }, "run-x1", "starting")
        .phase,
    ).toBe("running");
  });

  it("started + 已收束（finished 先到）→ 保持当前阶段，不复活", () => {
    const live = liveFixture("run-x1");
    // finished 已清空在途（null）并收束为 idle：fulfilled 不得复活 running
    expect(
      foldProjectedOutcome({ kind: "started", live }, null, "idle"),
    ).toEqual({ phase: "idle" });
  });
});
