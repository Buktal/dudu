import type { InboxEvent } from "../types";
import { applyAccessChanged } from "./access";
import { createRefreshScheduler } from "./live-refresh";
import {
  connectionFromFailure,
  reconcileInbox,
  settleConfirmedReplies,
} from "./reconciler";
import { reminderChange } from "./reminders";
import {
  abortRequest,
  beginRequest,
  cancelConversationRequests,
  getRequestScope,
  operationFailure,
  releaseAttachmentResources,
  requestKeys,
} from "./requests";
import { inboxActions } from "./slice";
import { type InboxCommand, onQueueSettled, releaseConnection } from "./store";

function connectInbox(reconnecting: boolean): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    runtime.unsubscribe?.();
    abortRequest(runtime, requestKeys.recovery);
    const request = beginRequest(runtime, requestKeys.events, getState);
    const controller = getRequestScope(runtime, requestKeys.events);
    let needsRecovery =
      reconnecting ||
      ["disconnected", "unavailable"].includes(getState().inbox.connection);
    let recovery: Promise<void> | undefined;
    const scheduler = createRefreshScheduler({
      isCurrent: () => request.current(),
      getState,
      dispatch,
      runtime,
    });
    onQueueSettled(runtime, () => scheduler.noteSettled(), request.signal);
    dispatch(
      inboxActions.connectionChanged(
        reconnecting ? "reconnecting" : "connecting",
      ),
    );
    try {
      const unsubscribe = runtime.api.subscribe({
        context: request.context,
        signal: request.signal,
        cursor: getState().inbox.events.cursor ?? undefined,
        onEvent: (event) => {
          if (!request.current()) return;
          const previous = getState().inbox;
          dispatch(receiveInboxEvent(event));
          scheduler.noteEvent(event, previous);
        },
        onConnection: (connection) => {
          if (!request.current()) return;
          // 连接离开 connecting 即放行初始读取：ready 后查询，失败也照常查询以呈现错误
          if (connection !== "connecting") releaseConnection(runtime);
          if (connection === "connected") {
            if (recovery) return;
            if (
              needsRecovery ||
              getState().inbox.connection === "disconnected"
            ) {
              needsRecovery = false;
              const task = dispatch(reconcileInbox(request.current));
              recovery = task;
              void task.finally(() => {
                if (recovery === task) {
                  recovery = undefined;
                  scheduler.noteSettled();
                }
              });
            } else {
              dispatch(inboxActions.connectionChanged("connected"));
              scheduler.noteSettled();
            }
          } else {
            needsRecovery = true;
            abortRequest(runtime, requestKeys.recovery);
            recovery = undefined;
            dispatch(inboxActions.connectionChanged(connection));
          }
        },
      });
      if (!request.current()) {
        unsubscribe();
        return;
      }
      let stopped = false;
      const stop = () => {
        if (stopped) return;
        stopped = true;
        controller?.abort();
        abortRequest(runtime, requestKeys.recovery);
        request.finish();
        unsubscribe();
        if (runtime.unsubscribe === stop) runtime.unsubscribe = undefined;
      };
      runtime.unsubscribe = stop;
      await recovery;
    } catch (error) {
      const current = request.current();
      controller?.abort();
      request.finish();
      releaseConnection(runtime);
      if (current)
        dispatch(
          inboxActions.connectionChanged(
            connectionFromFailure(operationFailure(error)),
          ),
        );
    }
  };
}

export function startInboxUpdates(): InboxCommand<Promise<void>> {
  return connectInbox(false);
}

export function reconnectInbox(): InboxCommand<Promise<void>> {
  return connectInbox(true);
}

function receiveInboxEvent(event: InboxEvent): InboxCommand {
  return (dispatch, getState, runtime) => {
    const previous = getState().inbox;
    dispatch(inboxActions.eventReceived(event));
    // 权限范围变化：重查身份与列表并清理已无权数据（处理顺序见 access.ts）
    if (event.type === "access-changed") {
      void dispatch(applyAccessChanged());
      return;
    }
    const state = getState().inbox;
    // 服务端不返回个人已读：真实链路的待处理提醒按本次运行的事件增减
    if (runtime.api.localUnread) {
      const reminder = reminderChange(previous, event);
      if (reminder) dispatch(inboxActions.reminderChanged(reminder));
    }
    if (state === previous) return;
    if (
      event.type === "removed" &&
      !state.conversations[event.conversationId] &&
      state.events.removed[event.conversationId] === event.version
    ) {
      const id = event.conversationId;
      cancelConversationRequests(runtime, id);
      releaseAttachmentResources(
        runtime,
        Object.values(previous.attachments)
          .filter((attachment) => attachment.conversationId === id)
          .map((attachment) => attachment.id),
      );
    }
    if (event.type === "message" || event.type === "receipt")
      dispatch(settleConfirmedReplies());
  };
}
