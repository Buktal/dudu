import type { InboxApi } from "./api";
import { createHttpInboxApi } from "./http-inbox-api";

export async function loadInboxApi(): Promise<InboxApi> {
  if (import.meta.env.VITE_DESK_MOCK === "true") {
    const { createDevelopmentInboxApi, isDevelopmentScenario } = await import(
      "./development/api"
    );
    const scenario = import.meta.env.VITE_DESK_SCENARIO;
    if (scenario !== undefined && !isDevelopmentScenario(scenario)) {
      throw new Error(`未知的 desk 调试场景：${scenario}`);
    }
    return createDevelopmentInboxApi({ scenario }).api;
  }
  // 显式 Mock 开关之外使用真实适配器；未接入的方法保持「接待服务未连接」语义
  return createHttpInboxApi();
}
