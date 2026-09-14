import { invoke } from "@tauri-apps/api/core";

import type { ConnectionConfig } from "@/features/connections";
import type { ExpectedReceipt } from "@/features/events";
import type { RunRecord, RunStep } from "./model";
import type { RunSnapshot } from "./snapshot";

/** 直发请求载荷：事件快照字段 + 确定性拼装好的明文（Rust 不重排 body） */
export type DirectDispatchPayload = {
  body: string;
  eventName: string;
  eventId: string;
  expected: ExpectedReceipt;
  runId: string;
};

/** 直发结果：成品单步快照（Rust 已完成期望比对）+ 用户是否请求过停止 */
export type DirectSendOutcome = {
  step: RunStep;
  /** 停止先于发送：请求未发出；停止发生在在途：保留真实回执并标记停止 */
  cancelled: boolean;
};

/** 读取本地持久化的全部运行记录（Rust 端 runs.json，时间升序） */
export function loadRuns(): Promise<RunRecord[]> {
  return invoke<RunRecord[]>("runs_load");
}

/** 追加一条运行记录，返回保存后的完整列表 */
export function saveRun(run: RunRecord): Promise<RunRecord[]> {
  return invoke<RunRecord[]>("runs_save", { run });
}

/**
 * 直发：把明文、事件快照与期望回执一次交给 Rust——按连接渠道路由协议
 * 原语（抖音签名 JSON POST / 企微加密信封 XML POST）、比对期望、组装
 * 成品单步快照（sends_dispatch_direct，ADR-0005：Rust 做重活）。
 */
export function dispatchDirect(
  config: ConnectionConfig,
  payload: DirectDispatchPayload,
): Promise<DirectSendOutcome> {
  return invoke<DirectSendOutcome>("sends_dispatch_direct", {
    config,
    ...payload,
  });
}

/**
 * 启动剧本运行：把物化好的运行快照（纯数据）与渠道连接交给 Rust 执行器，
 * 后台串行执行（进度经 run-progress 事件回报），命令立即返回 run id。
 */
export function startScenarioRun(
  snapshot: RunSnapshot,
  connections: ConnectionConfig[],
): Promise<string> {
  return invoke<string>("start_scenario_run", { snapshot, connections });
}

export function stopRun(runId: string): Promise<void> {
  return invoke<void>("stop_run", { runId });
}
