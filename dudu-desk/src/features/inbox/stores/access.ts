import { unauthorizedConversationIds } from "./access-reducers";
import { loadConversations } from "./queue";
import {
  cancelScopeRequests,
  releaseAttachmentResources,
  requestKeys,
  runOperation,
} from "./requests";
import { inboxActions } from "./slice";
import type { InboxState } from "./state";
import type { InboxCommand, InboxRuntime } from "./store";

/**
 * 权限范围变化（契约第 5 节 access-changed）：服务端只在员工-组或账号-组关系变化后
 * 发送类型报文，客户端负责重查身份与列表并按新范围收敛。处理顺序固定为：
 *
 * 1. 递增范围代数，让旧代数下发起的请求全部失效（generation 守卫），
 *    旧请求的迟到结果不写回新范围；
 * 2. 取消在途读取；实时订阅跟随连接生命周期，不受范围代数约束，继续接收后续报文；
 * 3. 重查身份取回当前授权账号集合，清理已无权的对话、名片、草稿、固定与提醒；
 *    身份未能确认时保留现有数据，只做列表重查；
 * 4. 重查列表按新范围展示，空态沿用现有展示。
 */
export function applyAccessChanged(): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    dispatch(inboxActions.scopeRevised());
    cancelScopeRequests(runtime);
    await runOperation(runtime, requestKeys.access, getState, async (op) => {
      const allowed = await refreshAccess(runtime);
      if (!op.current()) return;
      if (allowed) {
        releaseUnauthorized(runtime, getState().inbox, allowed);
        dispatch(inboxActions.accessScopeApplied([...allowed]));
      }
      await dispatch(loadConversations());
    });
  };
}

// 已无权对话的本地附件与预览随状态清理一并释放：请求已由 cancelScopeRequests 取消
function releaseUnauthorized(
  runtime: InboxRuntime,
  state: InboxState,
  allowed: ReadonlySet<string>,
) {
  const pruned = new Set(unauthorizedConversationIds(state, allowed));
  if (!pruned.size) return;
  releaseAttachmentResources(
    runtime,
    Object.values(state.attachments)
      .filter((attachment) => pruned.has(attachment.conversationId))
      .map((attachment) => attachment.id),
  );
}

// 身份重查失败（网络故障或已退出）返回 null：不加清理、不放行，交由退出流程与下次刷新收敛
async function refreshAccess(
  runtime: InboxRuntime,
): Promise<ReadonlySet<string> | null> {
  try {
    return (await runtime.refreshAccess?.()) ?? null;
  } catch {
    return null;
  }
}
