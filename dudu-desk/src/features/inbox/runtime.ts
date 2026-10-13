import type { InboxApi } from "./api";
import { createHttpInboxApi } from "./http-inbox-api";

// 真实适配器是唯一实现；未接入的方法保持「接待服务未连接」语义
export async function loadInboxApi(): Promise<InboxApi> {
  return createHttpInboxApi();
}
