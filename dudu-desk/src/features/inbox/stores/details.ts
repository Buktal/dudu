import { uniq } from "lodash-es";
import { loadConversations } from "./queue";
import { needsQueueReloadAfterProfileSave } from "./queue-membership";
import { runConversationOperation } from "./requests";
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

/**
 * Saves the local draft. `overwrite` is the confirmed path: the operator
 * acknowledged another employee's update while editing, so the request rebases
 * onto the latest version the client knows and the later save wins. Without it
 * the original editing baseline is kept, so an unacknowledged stale save is
 * rejected by a server that checks the version instead of silently winning.
 */
export function saveVisitorProfile(
  conversationId: string,
  { overwrite = false }: { overwrite?: boolean } = {},
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
    await runConversationOperation(
      runtime,
      getState,
      conversationId,
      "profile-save",
      {
        loading: () => dispatch(inboxActions.profileSaving(conversationId)),
        call: (io) =>
          runtime.api.saveProfile({
            ...io,
            conversationId,
            tags: uniq(
              edit.tagsText
                .split(/[,，;；\r\n]+/)
                .map((tag) => tag.trim())
                .filter(Boolean),
            ),
            note: edit.note,
            version: overwrite
              ? Math.max(edit.baseVersion, profile.version)
              : edit.baseVersion,
          }),
        validate: (result) =>
          result.conversationId !== conversationId ||
          result.version < edit.baseVersion
            ? "资料保存结果不匹配，请刷新后重试"
            : undefined,
        loaded: async (result) => {
          dispatch(
            inboxActions.profileSaved({
              profile: result,
              revision: edit.revision,
            }),
          );
          if (needsQueueReloadAfterProfileSave(getState().inbox.queue.query))
            await dispatch(loadConversations());
        },
        failed: (failure) =>
          dispatch(
            inboxActions.profileSaveFailed({
              conversationId,
              error: failure,
            }),
          ),
      },
    );
  };
}
