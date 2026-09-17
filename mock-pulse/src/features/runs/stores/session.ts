import type { ConnectionConfig } from "@/features/connections";
import { isConnectionReady } from "@/features/connections";
import type { ChannelId } from "@/lib/channels";

import type { LiveRun } from "./live";
import type { PlanPhaseLike } from "./plan-adapter";

/**
 * 运行会话（全局唯一不变的独占出口）：「同一时刻只能有一个运行」。
 * 直发 / 剧本 / 编排三种运行的启动资格、在途标识、连接就绪门与停止态
 * 都在这里裁决；三个 thunk condition 与各处 UI busy 一律消费本模块，
 * 不再各自重算。对 plans 域状态用适配器最小类型接收（runs 侧不反向
 * import plans，形状单点见 plan-adapter.ts），由调用方传入完整 root
 * state 即可（结构化 duck typing）。
 *
 * 竞态守卫归属（finished-vs-invoke 住 session 而非 live 的原因）：守卫决定的是
 * 阶段（RunPhase 是否进入 running，会话状态），而非投影形状；live 只负责实况
 * 收敛（liveStarted / runProgress / applyLiveProgress），不做阶段决策。
 * 两 slice 订阅 shouldConfirmRunning，不再各自写相等判断。
 */

/** 运行阶段（直发面板 / 剧本运行 / 编排运行统一词汇） */
export type RunPhase =
  | "idle"
  | "starting"
  | "running"
  | "needConnection"
  | "error";

/** 运行种类：直发 / 剧本 / 编排 */
export type RunKind = "direct" | "scenario" | "plan";

/** 正在占用的运行会话（kind + runId） */
export type ActiveRun = { kind: RunKind; runId: string };

/** 启动裁决：ok 放行；拒绝时 reason 指明占用方（供指引文案定位） */
export type RunStartCheck = { ok: true } | { ok: false; reason: RunKind };

/** 运行会话视角的全局状态：runs 自身 + plans 的适配器最小形状 */
export type RunSessionState = {
  runs: {
    /** 直发面板 phase（sending = 直发在途） */
    phase: "idle" | "sending" | "needConnection" | "error" | "done";
    scenarioRunPhase: RunPhase;
    live: LiveRun | null;
    directLive?: { runId: string; eventId: string } | null;
    stoppingRunId?: string | null;
  };
  plans: PlanPhaseLike;
};

/** 停止态的最小形状（RunsState 结构化子集） */
type StoppingState = { stoppingRunId?: string | null };

/** 连接配置的最小形状（ConnectionsState 结构化子集） */
type ConnectionState = {
  connections: { items: Record<string, ConnectionConfig | undefined> };
};

function phaseBusy(phase: RunPhase): boolean {
  return phase === "starting" || phase === "running";
}

/**
 * finished-vs-invoke 竞态确认（两 slice  fulfilled 共用唯一守卫）：完成事件可能
 * 早于命令返回（恒例见 live.ts startLiveRun）——fulfilled 仅当 incoming 仍是
 * 当前在途才进入 running，否则保持 finished 已收束的 idle。runs 侧传 live?.runId，
 * plans 侧传 activeRunId，语义同为「当前在途 id」。
 */
export function shouldConfirmRunning(
  currentRunId: string | null | undefined,
  incomingRunId: string,
): boolean {
  return currentRunId === incomingRunId;
}

/**
 * 现在能不能启动新运行（直发/剧本/编排统一口径）。
 * 拒绝时 reason 为占用会话的运行种类，优先级与占用顺序一致：
 * 直发 → 剧本 → 编排。
 */
export function canStartRun(state: RunSessionState): RunStartCheck {
  if (state.runs.phase === "sending") return { ok: false, reason: "direct" };
  if (phaseBusy(state.runs.scenarioRunPhase))
    return { ok: false, reason: "scenario" };
  if (phaseBusy(state.plans.planRunPhase)) return { ok: false, reason: "plan" };
  return { ok: true };
}

/** 任一运行启动中/进行中（UI busy 统一口径，按钮禁用即由此得出） */
export function isRunBusy(state: RunSessionState): boolean {
  return !canStartRun(state).ok;
}

/** 正在跑的是什么（kind + runId；直发取面板簿记，剧本/编排取实况投影） */
export function activeRun(state: RunSessionState): ActiveRun | null {
  if (state.runs.phase === "sending" && state.runs.directLive) {
    return { kind: "direct", runId: state.runs.directLive.runId };
  }
  const live = state.runs.live;
  if (live) return { kind: live.kind, runId: live.runId };
  return null;
}

/**
 * 缺哪个渠道的连接（连接就绪门的唯一出口）：渠道列表去重后逐一确认，
 * 未就绪（缺条目/缺地址/缺凭据）的按首次出现顺序返回。
 */
export function missingConnections(
  state: ConnectionState,
  channels: readonly ChannelId[],
): ChannelId[] {
  return [...new Set(channels)].filter(
    (channel) => !isConnectionReady(state.connections.items[channel]),
  );
}

/** 正在停止的运行 runId（无则 null） */
export function stoppingRunId(state: StoppingState): string | null {
  return state.stoppingRunId ?? null;
}

/** 指定运行是否正在停止（停止按钮的禁用与「正在停止…」文案共用） */
export function isStoppingRun(state: StoppingState, runId: string): boolean {
  return state.stoppingRunId === runId;
}
