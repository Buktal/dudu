import { invoke } from "@tauri-apps/api/core";

import type { ConnectionConfig } from "@/features/connections";
import type { PlanRunSnapshot } from "./materialize";
import type { Plan } from "./model";

/** 读取本地持久化的全部编排（Rust 端 plans/ 平铺目录，一编排一文件） */
export function loadPlans(): Promise<Plan[]> {
  return invoke<Plan[]>("plans_load");
}

/** 保存单个编排（按 id 覆盖），返回保存后的完整列表 */
export function savePlan(plan: Plan): Promise<Plan[]> {
  return invoke<Plan[]>("plans_save", { plan });
}

/** 按 id 删除编排，返回删除后的完整列表 */
export function deletePlanById(planId: string): Promise<Plan[]> {
  return invoke<Plan[]>("plans_delete", { planId });
}

/**
 * 启动编排运行：把物化好的编排快照（每 lane 一份剧本运行快照）与
 * 所需渠道连接交给 Rust 执行器，后台按串并行与失败策略执行
 * （进度带 lane 经 run-progress 事件回报），命令立即返回 run id。
 */
export function startPlanRun(
  snapshot: PlanRunSnapshot,
  connections: ConnectionConfig[],
): Promise<string> {
  return invoke<string>("start_plan_run", { snapshot, connections });
}
