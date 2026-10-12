import type { AccountApi } from "./api";
import { createHttpAccountApi } from "./http-account-api";

export async function loadAccountApi(): Promise<AccountApi> {
  // 显式 Mock 开关之外一律使用真实企业登录；加载失败由账户门禁回落到不可用适配器
  if (import.meta.env.VITE_DESK_MOCK === "true") {
    const { createDevelopmentAccountApi } = await import("./mocks");
    return createDevelopmentAccountApi();
  }
  return createHttpAccountApi();
}
