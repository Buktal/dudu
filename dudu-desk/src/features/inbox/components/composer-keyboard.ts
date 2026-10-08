/**
 * Composer keyboard intent: an Enter keydown → send action, or null when the
 * text input keeps the key (IME composition confirmation, Shift+Enter
 * newline). Ctrl/Cmd+Enter sends and advances to the next visitor.
 */
export function composerIntent(event: {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  isComposing: boolean;
  keyCode?: number;
}): "send" | "next" | null {
  if (
    event.isComposing ||
    event.keyCode === 229 ||
    event.key !== "Enter" ||
    event.shiftKey
  )
    return null;
  return event.ctrlKey || event.metaKey ? "next" : "send";
}
