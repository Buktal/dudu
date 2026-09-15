import { createConversations } from "./mocks";

// Prototype contract: in-memory scenarios only, no network or real messages.
export const getConversations = () => createConversations();
