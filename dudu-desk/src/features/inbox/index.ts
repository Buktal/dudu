export { type InboxApi, unavailableInboxApi } from "./api";
export { InboxWorkspace } from "./inbox-workspace";
// Public interface of the inbox module: the workspace seam and the api type.
// Selectors, store types and command thunks are feature internals — consumers
// (App.tsx and the smoke test) only compose the workspace through this surface.
