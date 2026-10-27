import { applyAccessChanged } from "./access";
import { ensureHistoryLoaded, loadProfile } from "./reading";
import { reminderSettlement } from "./reminders";
import { requestKeys, runOperation } from "./requests";
import { settleConfirmedReplies } from "./sending";
import { inboxActions } from "./slice";
import {
  connectionFromFailure,
  displaysConversation,
  type InboxState,
} from "./state";
import type { InboxCommand } from "./store";

/**
 * 断线重连后的重新加载（契约第 3、5 节）：Socket 重新 ready 后重新执行已有初始化
 * 查询，不新增恢复专用接口、事件重放或差量对账。顺序：
 *
 * 1. 重查身份与访客列表：与 access-changed 共用同一链路（范围代数递增 → 取消在途读取 →
 *    重查身份清理已无权数据 → 重读列表第一页与计数），旧代数请求的结果不写回新状态；
 * 2. 旧历史缓存失效并重载正在显示的访客（最近页重取，更早消息照常向上分页）；
 * 3. 待处理提醒按重查结果收敛：已处理的不再提醒，补回的旧消息不制造新提醒。
 *
 * 临时断线保留合法草稿与提醒；列表读取失败按失败类别上报连接状态并提示。
 */
export function reloadInbox(
  sourceCurrent: () => boolean,
): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    dispatch(inboxActions.connectionChanged("reconnecting"));
    // 身份/权限与列表的重查顺序由 access 模块单点持有，重连不另起一套：
    // 内部先递增范围代数并取消在途读取，旧请求的结果不写回新状态
    await dispatch(applyAccessChanged());
    if (!sourceCurrent()) return;
    const failure = getState().inbox.queue.error;
    if (failure) {
      dispatch(inboxActions.connectionChanged(connectionFromFailure(failure)));
      dispatch(inboxActions.noticeChanged(failure.message));
      return;
    }
    await runOperation(runtime, requestKeys.recovery, getState, async (op) => {
      const current = () => op.current() && sourceCurrent();
      // 旧历史缓存失效：显示中的访客重取最近页与名片，其余切回时按需加载
      dispatch(inboxActions.historiesInvalidated());
      await Promise.all(
        displayedConversationIds(getState().inbox).flatMap((id) => [
          dispatch(ensureHistoryLoaded(id)),
          dispatch(loadProfile(id)),
        ]),
      );
      if (!current()) return;
      // 发送结果直接取重查结果：重取到的消息按同一合并内核结算在途提交
      dispatch(settleConfirmedReplies());
      // 已处理事项不重新提醒：重查结果决定提醒状态
      for (const change of reminderSettlement(getState().inbox))
        dispatch(inboxActions.reminderChanged(change));
      dispatch(inboxActions.connectionChanged("connected"));
    });
  };
}

/** 重连重载的目标：状态里正在显示的访客（专注、回复目标、并排固定或整段历史）。 */
function displayedConversationIds(state: InboxState): string[] {
  return Object.keys(state.conversations).filter((id) =>
    displaysConversation(state, id),
  );
}
