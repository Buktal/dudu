import { uniq } from "lodash-es";
import { DeskApiError } from "@/lib/api-response";
import type { ProfileChanges } from "./detail-state";
import { loadConversations } from "./reading";
import { beginRequest, failureOf } from "./requests";
import { inboxActions } from "./slice";
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
    const request = beginRequest(
      runtime,
      `profile-save:${conversationId}`,
      getState,
    );
    dispatch(inboxActions.profileSaving(conversationId));
    try {
      const result = await runtime.api.saveProfile({
        context: request.context,
        signal: request.signal,
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
      if (!request.current()) return;
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
        inboxActions.profileSaved({ profile: result, revision: edit.revision }),
      );
    } catch (error) {
      if (request.current()) {
        dispatch(
          inboxActions.profileSaveFailed({
            conversationId,
            error: failureOf(error),
          }),
        );
      }
    } finally {
      request.finish();
    }
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
    const request = beginRequest(runtime, `star:${conversationId}`, getState);
    dispatch(inboxActions.starSaving(conversationId));
    try {
      const result = await runtime.api.setStarred({
        context: request.context,
        signal: request.signal,
        conversationId,
        starred,
      });
      if (!request.current()) return;
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
      if (getState().inbox.queue.query.starred)
        await dispatch(loadConversations());
    } catch (error) {
      if (request.current()) {
        dispatch(
          inboxActions.starFailed({ conversationId, error: failureOf(error) }),
        );
      }
    } finally {
      request.finish();
    }
  };
}
