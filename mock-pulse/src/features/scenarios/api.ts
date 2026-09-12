import { invoke } from "@tauri-apps/api/core";

import type { Scenario } from "./model";

/** 读取本地持久化的全部剧本（Rust 端按渠道子目录落盘，读取时聚合回填渠道） */
export function loadScenarios(): Promise<Scenario[]> {
  return invoke<Scenario[]>("scenarios_load");
}

/** 保存单个剧本（按 id 覆盖），返回保存后的完整列表 */
export function saveScenario(scenario: Scenario): Promise<Scenario[]> {
  return invoke<Scenario[]>("scenarios_save", { scenario });
}

/** 按 id 删除剧本，返回删除后的完整列表 */
export function deleteScenarioById(scenarioId: string): Promise<Scenario[]> {
  return invoke<Scenario[]>("scenarios_delete", { scenarioId });
}
