import type { PayloadAction } from "@reduxjs/toolkit";
import type { ApiFailure } from "@/lib/api-response";
import type { InboxMessage, Page, VisitorProfile } from "../types";
import { mergeMessage, mergeProfile, orderMessages } from "./live-merge";
import { emptyLoad, type InboxState } from "./state";

export const readReducers = {
  conversationSelected(
    state: InboxState,
    action: PayloadAction<string | null>,
  ) {
    state.activeId = action.payload;
    state.replyId = action.payload;
    state.selectionRevision++;
    state.notice = null;
  },
  historyLoading(state: InboxState, action: PayloadAction<string>) {
    const id = action.payload;
    state.histories[id] ??= { ...emptyLoad(), ids: [] };
    state.histories[id].status = "loading";
    state.histories[id].error = null;
    delete state.histories[id].failedRead;
  },
  historyCancelled(state: InboxState, action: PayloadAction<string>) {
    const history = state.histories[action.payload];
    if (history?.status !== "loading") return;
    history.status = history.hasLoaded ? "ready" : "idle";
    history.error = null;
  },
  /**
   * 重连后的旧历史缓存失效（契约第 3 节）：丢弃已缓存的消息投影并把 hasLoaded 重置，
   * 正在显示的访客按最近页重取，其余切回时按需重取；更早消息从新最近页的游标照常
   * 向上分页。在途发送的本地气泡不是历史缓存——它们的投影保留到服务端结果或本地
   * 结算落定为止。
   */
  historiesInvalidated(state: InboxState) {
    for (const history of Object.values(state.histories)) {
      history.ids = history.ids.filter((id) => {
        const status = state.submissions[id]?.status;
        return status === "sending" || status === "unconfirmed";
      });
      history.hasLoaded = false;
      history.nextCursor = null;
      history.status = "idle";
      history.error = null;
      delete history.failedRead;
    }
  },
  historyLoaded(
    state: InboxState,
    action: PayloadAction<{ conversationId: string; page: Page<InboxMessage> }>,
  ) {
    const { conversationId, page } = action.payload;
    const history = state.histories[conversationId];
    const ids = page.items
      .filter((message) => message.conversationId === conversationId)
      .map((message) => mergeMessage(state, message));
    history.ids = orderMessages(state, [...history.ids, ...ids]);
    history.status = "ready";
    history.hasLoaded = true;
    history.error = null;
    history.nextCursor = page.nextCursor;
  },
  historyFailed(
    state: InboxState,
    action: PayloadAction<{
      conversationId: string;
      error: ApiFailure;
      more: boolean;
    }>,
  ) {
    const { conversationId, error, more } = action.payload;
    const history = state.histories[conversationId];
    history.status = "error";
    history.error = error;
    history.failedRead = more ? "more" : "refresh";
  },
  profileLoading(state: InboxState, action: PayloadAction<string>) {
    const previous = state.profiles[action.payload];
    state.profiles[action.payload] = {
      ...previous,
      status: "loading",
      error: null,
    };
  },
  /** 与 historyCancelled 同构：在途读取被取消（会话切换或权限范围变化）时把
   *  loading 落回 idle，已有数据保留，避免卡在读态无法重新进入。 */
  profileCancelled(state: InboxState, action: PayloadAction<string>) {
    const profile = state.profiles[action.payload];
    if (profile?.status !== "loading") return;
    profile.status = "idle";
    profile.error = null;
  },
  profileLoaded(state: InboxState, action: PayloadAction<VisitorProfile>) {
    mergeProfile(state, action.payload);
  },
  profileFailed(
    state: InboxState,
    action: PayloadAction<{ conversationId: string; error: ApiFailure }>,
  ) {
    const previous = state.profiles[action.payload.conversationId];
    state.profiles[action.payload.conversationId] = {
      ...previous,
      status: "error",
      error: action.payload.error,
    };
  },
  noticeChanged(state: InboxState, action: PayloadAction<string | null>) {
    state.notice = action.payload
      ? { kind: "information", message: action.payload }
      : null;
  },
};
