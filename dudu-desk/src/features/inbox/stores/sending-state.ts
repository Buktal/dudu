import type { ApiFailure } from "@/lib/api-response";
import type {
  InboxMessage,
  MediaReference,
  SendKind,
  SendSubmission,
} from "../types";

export type ReplyDraft = {
  text: string;
  attachmentIds: string[];
  revision: number;
  textRevision: number;
};
export type DraftAttachment = {
  id: string;
  conversationId: string;
  kind: Exclude<SendKind, "text">;
  name: string;
  mimeType: string;
  size: number;
  status: "preparing" | "ready" | "failed";
  media?: MediaReference;
  error?: string;
  previewUrl?: string;
};
export type ReplySubmission = {
  request: SendSubmission;
  messageId: string;
  draftRevision: number;
  textRevision: number;
  draftAttachmentIds: string[];
  selectionRevision: number;
  next: boolean;
  status: "sending" | "accepted" | "failed" | "unconfirmed";
};
export type EndState = {
  status: "saving" | "saved" | "error";
  error?: ApiFailure;
};
export const blankDraft: ReplyDraft = {
  text: "",
  attachmentIds: [],
  revision: 0,
  textRevision: 0,
};
export type StartSubmission = {
  submission: ReplySubmission;
  message: InboxMessage;
};
