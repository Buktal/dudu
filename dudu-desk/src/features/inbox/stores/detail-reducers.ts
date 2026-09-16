import type { PayloadAction } from "@reduxjs/toolkit";
import type { ApiFailure } from "@/lib/api-response";
import type { Conversation, VisitorProfile } from "../types";
import { mergeConversation } from "./read-reducers";
import type { InboxState, ProfileChanges } from "./state";

export const detailReducers = {
  profileEdited(
    state: InboxState,
    action: PayloadAction<{ conversationId: string; changes: ProfileChanges }>,
  ) {
    const { conversationId, changes } = action.payload;
    const profile = state.profiles[conversationId]?.data;
    if (!profile) return;
    const previous = state.profileEdits[conversationId];
    if (
      !previous ||
      (previous.revision === previous.savedRevision &&
        previous.status !== "saving")
    ) {
      state.profileEdits[conversationId] = {
        tagsText: profile.tags.join("，"),
        note: profile.note,
        revision: 0,
        savedRevision: 0,
        baseVersion: profile.version,
        status: "idle",
        error: null,
      };
    }
    const edit = state.profileEdits[conversationId];
    const note = changes.note ?? edit.note;
    const tagsText = changes.tagsText ?? edit.tagsText;
    if (edit.note === note && edit.tagsText === tagsText) return;
    edit.note = note;
    edit.tagsText = tagsText;
    edit.revision++;
    if (edit.status !== "saving") edit.status = "idle";
    edit.error = null;
  },
  profileEditsDiscarded(state: InboxState, action: PayloadAction<string>) {
    if (state.profileEdits[action.payload]?.status !== "saving") {
      delete state.profileEdits[action.payload];
    }
  },
  profileSaving(state: InboxState, action: PayloadAction<string>) {
    const edit = state.profileEdits[action.payload];
    if (edit) {
      edit.status = "saving";
      edit.error = null;
    }
  },
  profileSaved(
    state: InboxState,
    action: PayloadAction<{ profile: VisitorProfile; revision: number }>,
  ) {
    const { profile, revision } = action.payload;
    const previous = state.profiles[profile.conversationId];
    if (!previous?.data || profile.version >= previous.data.version) {
      state.profiles[profile.conversationId] = {
        data: profile,
        status: "ready",
        error: null,
      };
    }
    const edit = state.profileEdits[profile.conversationId];
    if (!edit) return;
    edit.savedRevision = revision;
    edit.baseVersion = profile.version;
    edit.status = "saved";
    edit.error = null;
    if (edit.revision === revision) {
      edit.tagsText = profile.tags.join("，");
      edit.note = profile.note;
    }
  },
  profileSaveFailed(
    state: InboxState,
    action: PayloadAction<{ conversationId: string; error: ApiFailure }>,
  ) {
    const edit = state.profileEdits[action.payload.conversationId];
    if (edit) {
      edit.status = "error";
      edit.error = action.payload.error;
    }
  },
  starSaving(state: InboxState, action: PayloadAction<string>) {
    state.starUpdates[action.payload] = { status: "saving", error: null };
  },
  starSaved(state: InboxState, action: PayloadAction<Conversation>) {
    mergeConversation(state, action.payload);
    state.starUpdates[action.payload.id] = { status: "saved", error: null };
  },
  starFailed(
    state: InboxState,
    action: PayloadAction<{ conversationId: string; error: ApiFailure }>,
  ) {
    state.starUpdates[action.payload.conversationId] = {
      status: "error",
      error: action.payload.error,
    };
  },
};
