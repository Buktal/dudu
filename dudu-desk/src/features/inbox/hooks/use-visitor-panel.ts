import { useState } from "react";
import { useWorkspaceViewport } from "./use-workspace-viewport";

export function useVisitorPanel() {
  const { inlineInfo: inline, narrow } = useWorkspaceViewport();
  const [open, setOpen] = useState(inline);
  const [previousInline, setPreviousInline] = useState(inline);
  // A window resize must not turn the inline panel into an unsolicited modal.
  if (previousInline !== inline) {
    setPreviousInline(inline);
    if (!inline) setOpen(false);
  }
  return {
    inline,
    narrow,
    open,
    setOpen,
    toggle: () => setOpen((value) => !value),
  };
}
