import type { PayloadAction } from "@reduxjs/toolkit";
import type { MediaReference } from "../types";
import { blankDraft, type DraftAttachment, type InboxState } from "./state";

export const attachmentReducers = {
  attachmentAdded(state: InboxState, action: PayloadAction<DraftAttachment>) {
    const attachment = action.payload;
    if (
      !state.conversations[attachment.conversationId] ||
      state.attachments[attachment.id]
    )
      return;
    const draft = state.drafts[attachment.conversationId] ?? {
      ...blankDraft,
      attachmentIds: [],
    };
    state.attachments[attachment.id] = attachment;
    state.drafts[attachment.conversationId] = {
      ...draft,
      attachmentIds: [...draft.attachmentIds, attachment.id],
      revision: draft.revision + 1,
    };
  },
  attachmentPreparing(state: InboxState, action: PayloadAction<string>) {
    const attachment = state.attachments[action.payload];
    if (!attachment) return;
    attachment.status = "preparing";
    delete attachment.error;
    delete attachment.media;
  },
  attachmentReady(
    state: InboxState,
    action: PayloadAction<{ id: string; media: MediaReference }>,
  ) {
    const attachment = state.attachments[action.payload.id];
    if (attachment?.status !== "preparing") return;
    attachment.status = "ready";
    attachment.media = action.payload.media;
    delete attachment.error;
  },
  attachmentFailed(
    state: InboxState,
    action: PayloadAction<{ id: string; error: string }>,
  ) {
    const attachment = state.attachments[action.payload.id];
    if (!attachment) return;
    attachment.status = "failed";
    attachment.error = action.payload.error;
    delete attachment.media;
  },
  attachmentRemoved(state: InboxState, action: PayloadAction<string>) {
    const attachment = state.attachments[action.payload];
    if (!attachment) return;
    const draft = state.drafts[attachment.conversationId];
    if (draft) {
      draft.attachmentIds = draft.attachmentIds.filter(
        (id) => id !== attachment.id,
      );
      draft.revision += 1;
    }
    delete state.attachments[attachment.id];
  },
};
