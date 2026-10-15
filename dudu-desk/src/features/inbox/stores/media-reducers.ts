import type { PayloadAction } from "@reduxjs/toolkit";
import type { InboxState } from "./state";

/** 媒体状态的 key 拼写：消息 id 与消息内媒体下标拼成，消息 id 本身可含冒号。 */
export function mediaKey(messageId: string, index: number): string {
  return `${messageId}:${index}`;
}

// mediaKey 的反解：取最后一个冒号之前，供按消息归属清理媒体条目与对象 URL
export function mediaMessageId(key: string): string {
  return key.slice(0, key.lastIndexOf(":"));
}

/**
 * 消息媒体读取状态：按「消息:下标」记录在途、成功与失败，成功后持有本地对象 URL。
 * 资源生命周期与附件预览一致：对象 URL 在 detach 时按会话回收（access.ts）、
 * 上下文重置时由 cancelRequests 统一回收，本状态条目随 detachConversation 一并拆除。
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
