import { invoke } from "@tauri-apps/api/core";

import type { DouyinConnectionConfig } from "@/features/connections";
import type { RunRecord } from "./model";

/** 抖音直发的回执（Rust sends_dispatch_douyin 返回，camelCase） */
export type DispatchOutcome = {
  msgId: string;
  signature: string;
  /** 0 = 未收到响应（超时/连接失败） */
  status: number;
  elapsedMs: number;
  body: string;
  error: string | null;
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
 * 抖音直发：把前端逐字节拼装的明文交给 Rust 签名（X-Douyin-Signature、
 * Msg-Id）并真实 POST 到连接配置的目标地址；字节透传不重排。
 */
export function dispatchDouyin(
  config: DouyinConnectionConfig,
  body: string,
): Promise<DispatchOutcome> {
  return invoke<DispatchOutcome>("sends_dispatch_douyin", { config, body });
}
