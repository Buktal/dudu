import type { PayloadAction } from "@reduxjs/toolkit";
import type { InboxState } from "./state";

/**
 * 消息媒体读取状态：按「消息:下标」记录在途、成功与失败，成功后持有本地对象 URL，
 * 与附件预览同一资源生命周期（上下文重置时由 cancelRequests 统一回收）。
 */
export const mediaReducers = {
  mediaRequested(state: InboxState, action: PayloadAction<string>) {
    state.media[action.payload] = { status: "loading" };
  },
  mediaReady(
    state: InboxState,
    action: PayloadAction<{ key: string; url: string }>,
  ) {
    state.media[action.payload.key] = {
      status: "ready",
      url: action.payload.url,
    };
  },
  mediaFailed(state: InboxState, action: PayloadAction<string>) {
    state.media[action.payload] = { status: "error" };
  },
};
