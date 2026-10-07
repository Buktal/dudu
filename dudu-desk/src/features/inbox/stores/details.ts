import { uniq } from "lodash-es";
import { DeskApiError } from "@/lib/api-response";
import { loadConversations } from "./queue";
import {
  needsQueueReloadAfterProfileSave,
  needsQueueReloadAfterStarChange,
} from "./queue-membership";
import { failureOf, requestKeys, runOperation } from "./requests";
import { inboxActions } from "./slice";
import type { ProfileChanges } from "./state";
import type { InboxCommand } from "./store";

export function editVisitorProfile(
  conversationId: string,
  changes: ProfileChanges,
): InboxCommand {
  return (dispatch) => {
    dispatch(inboxActions.profileEdited({ conversationId, changes }));
  };
}

export function discardProfileEdits(conversationId: string): InboxCommand {
  return (dispatch) => {
    dispatch(inboxActions.profileEditsDiscarded(conversationId));
  };
}

export function saveVisitorProfile(
  conversationId: string,
): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    const state = getState().inbox;
    const profile = state.profiles[conversationId]?.data;
    const edit = state.profileEdits[conversationId];
    if (
      !profile ||
      !edit ||
      edit.status === "saving" ||
      edit.revision === edit.savedRevision
    )
      return;
    await runOperation(
      runtime,
      requestKeys.profileSave(conversationId),
      getState,
      async (op) => {
        dispatch(inboxActions.profileSaving(conversationId));
        try {
          const result = await runtime.api.saveProfile({
            context: op.context,
            signal: op.signal,
            conversationId,
            tags: uniq(
              edit.tagsText
                .split(/[,，;；\r\n]+/)
                .map((tag) => tag.trim())
                .filter(Boolean),
            ),
            note: edit.note,
            version: edit.baseVersion,
          });
          if (!op.current()) return;
          if (
            result.conversationId !== conversationId ||
            result.version < edit.baseVersion
          ) {
            throw new DeskApiError(
              "invalid-response",
              "资料保存结果不匹配，请刷新后重试",
            );
          }
          dispatch(
            inboxActions.profileSaved({
              profile: result,
              revision: edit.revision,
            }),
          );
          if (needsQueueReloadAfterProfileSave(getState().inbox.queue.query))
            await dispatch(loadConversations());
        } catch (error) {
          op.settle(() =>
            dispatch(
              inboxActions.profileSaveFailed({
                conversationId,
                error: failureOf(error, "暂时无法连接服务，请稍后重试"),
              }),
            ),
          );
        }
      },
    );
  };
}

export function setConversationStarred(
  conversationId: string,
  starred: boolean,
): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    const state = getState().inbox;
    const conversation = state.conversations[conversationId];
    if (!conversation || state.starUpdates[conversationId]?.status === "saving")
      return;
    await runOperation(
      runtime,
      requestKeys.star(conversationId),
      getState,
      async (op) => {
        dispatch(inboxActions.starSaving(conversationId));
        try {
          const result = await runtime.api.setStarred({
            context: op.context,
            signal: op.signal,
            conversationId,
            starred,
          });
          if (!op.current()) return;
          if (
            result.id !== conversationId ||
            result.identity.id !== conversation.identity.id ||
            result.identity.accountId !== conversation.identity.accountId ||
            result.identity.channelId !== conversation.identity.channelId ||
            result.starred !== starred
          ) {
            throw new DeskApiError(
              "invalid-response",
              "星标保存结果不匹配，请刷新后重试",
            );
          }
          dispatch(inboxActions.starSaved(result));
          if (needsQueueReloadAfterStarChange(getState().inbox.queue.query))
            await dispatch(loadConversations());
        } catch (error) {
          op.settle(() =>
            dispatch(
              inboxActions.starFailed({
                conversationId,
                error: failureOf(error, "暂时无法连接服务，请稍后重试"),
              }),
            ),
          );
        }
      },
    );
  };
}
