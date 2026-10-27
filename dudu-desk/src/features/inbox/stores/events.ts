import type { InboxEvent } from "../types";
import { applyAccessChanged } from "./access";
import { createRefreshScheduler } from "./live-refresh";
import { reloadInbox } from "./reload";
import { reminderChange } from "./reminders";
import {
  abortRequest,
  beginRequest,
  getRequestScope,
  operationFailure,
  requestKeys,
} from "./requests";
import { settleConfirmedReplies } from "./sending";
import { inboxActions } from "./slice";
import { connectionFromFailure } from "./state";
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
              const task = dispatch(reloadInbox(request.current));
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
            const previous = getState().inbox.connection;
            needsRecovery = true;
            abortRequest(runtime, requestKeys.recovery);
            recovery = undefined;
            dispatch(inboxActions.connectionChanged(connection));
            // unavailable 仅来自订阅认证被拒与本地无凭据：经账户缝隙重查一次身份，
            // 凭据确已失效时账户层清凭据回登录态；其余结果不改变连接状态，
            // 交由手动重连与下次身份读取收敛
            if (connection === "unavailable" && previous !== "unavailable") {
              void runtime.refreshAccess?.().catch(() => {});
            }
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
  return (dispatch, getState) => {
    const previous = getState().inbox;
    dispatch(inboxActions.eventReceived(event));
    // 权限范围变化：重查身份与列表并清理已无权数据（处理顺序见 access.ts）
    if (event.type === "access-changed") {
      void dispatch(applyAccessChanged());
      return;
    }
    const state = getState().inbox;
    // 服务端不返回个人已读：待处理提醒按本次运行的事件增减；
    // 传合并后的状态，结束报文按最新共享状态判定（较新的待回复不被误清）
    const reminder = reminderChange(state, event);
    if (reminder) dispatch(inboxActions.reminderChanged(reminder));
    if (state === previous) return;
    if (event.type === "message") dispatch(settleConfirmedReplies());
  };
}
