import type { PayloadAction } from "@reduxjs/toolkit";
import { detachConversation } from "./live-merge";
import type { InboxState } from "./state";

/**
 * 权限范围变化的状态转换：范围代数与按新授权范围清理已无权数据。
 * 清理复用会话拆除（live-merge 的 detachConversation），只额外移除回复草稿正文，
 * 仍属当前授权范围的对话、消息、历史、名片与草稿保持不变。
 */
export const accessReducers = {
  /**
   * 范围代数递增：在旧代数下发起的请求全部失效（见 requests.ts 的 generation 守卫），
   * 迟到的响应不得写回新范围。
   */
  scopeRevised(state: InboxState) {
    state.generation += 1;
  },
  /** 身份重查后的新授权账号集合：不属于任一账号的对话连同其缓存消失。 */
  accessScopeApplied(state: InboxState, action: PayloadAction<string[]>) {
    const allowed = new Set(action.payload);
    let selectionCleared = false;
    for (const id of unauthorizedConversationIds(state, allowed)) {
      selectionCleared = detachConversation(state, id) || selectionCleared;
      delete state.drafts[id];
    }
    if (selectionCleared) {
      // 与 removed 事件相同：被清理的会话正是当前选中/固定对象时提示重新选择
      state.selectionRevision++;
      state.notice = {
        kind: "information",
        message: "这段会话已不可用，请选择其他会话继续接待。",
      };
    }
  },
};

/** 当前授权账号集合之外的对话：状态清理与运行时资源释放共用同一判定。 */
export function unauthorizedConversationIds(
  state: InboxState,
  allowed: ReadonlySet<string>,
): string[] {
  return Object.values(state.conversations)
    .filter((conversation) => !allowed.has(conversation.identity.accountId))
    .map((conversation) => conversation.id);
}
