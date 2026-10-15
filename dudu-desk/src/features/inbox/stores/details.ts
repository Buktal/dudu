import { parseTags } from "../tags";
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
 * Saves the local draft. The server keeps no version-conflict rejection
 * (contract §2): the component asks for one overwrite confirmation when
 * another employee saved meanwhile, then this plain save wins as the later
 * write — no version is sent and no rebase happens here.
 */
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
            tags: parseTags(edit.tagsText),
            note: edit.note,
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
