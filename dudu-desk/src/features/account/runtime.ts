import type { AccountApi } from "./api";
import { createHttpAccountApi } from "./http-account-api";

// 真实适配器是唯一实现；加载失败由账户门禁回落到不可用适配器
export async function loadAccountApi(): Promise<AccountApi> {
  return createHttpAccountApi();
}
