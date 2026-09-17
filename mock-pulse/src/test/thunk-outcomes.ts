import { expect } from "vitest";

import type { ChannelId } from "@/lib/channels";

/**
 * thunk 启动 outcome 的缺连接断言：直发 / 剧本 / 编排三条启动路共用
 * 同一词汇（`{ kind: "needConnection", channels }`），断言形状收敛一处。
 * 首参为对应 thunk 的 fulfilled 守卫（如 `(a) => startPlanRun.fulfilled.match(a)`）。
 */
export function expectNeedConnection(
  isFulfilled: (action: unknown) => action is { payload: unknown },
  action: unknown,
  channels: readonly ChannelId[],
): void {
  expect(isFulfilled(action)).toBe(true);
  if (isFulfilled(action)) {
    expect(action.payload).toEqual({ kind: "needConnection", channels });
  }
}
