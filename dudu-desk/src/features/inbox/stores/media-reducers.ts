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
 * 对象 URL 的两条回收路径：上下文重置时统一回收（requests.ts 的 cancelRequests）、
 * 无权清理时按会话回收（access.ts 的 releaseUnauthorized，在途请求先由
 * cancelScopeRequests 取消、其本身不回收 URL）；重连的历史失效不丢消息投影，
 * 不做额外回收。状态条目随 detachConversation 一并拆除。
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
