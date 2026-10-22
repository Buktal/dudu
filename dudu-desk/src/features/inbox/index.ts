export { type InboxApi, unavailableInboxApi } from "./api";
export { InboxWorkspace } from "./inbox-workspace";
// Public interface of the inbox module: workspace, store seam, selectors and
// types. Command thunks are feature internals, imported via their domain
// modules (./stores/reading, ./stores/sending, …), not re-exported here.
export {
  selectActiveConversation,
  selectInbox,
  selectMessages,
  selectProfile,
  selectQueue,
  selectQueueConversations,
  selectQuickQueueConversations,
  selectReplyConversation,
} from "./stores/selectors";
export {
  createInboxStore,
  type InboxDispatch,
  type InboxRootState,
  type InboxStore,
} from "./stores/store";
export type {
  ConnectionState,
  Conversation,
  ConversationPage,
  ConversationQuery,
  InboxEvent,
  InboxMessage,
  MediaReference,
  MessageBody,
  Page,
  ReplyCapability,
  RequestOptions,
  SendKind,
  SendSubmission,
  SendTarget,
  VisitorIdentity,
  VisitorProfile,
  WorkContext,
} from "./types";
