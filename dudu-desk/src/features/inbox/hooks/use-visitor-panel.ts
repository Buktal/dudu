import { useState } from "react";
import { useWorkspaceViewport } from "./use-workspace-viewport";

export function useVisitorPanel() {
  const { inlineInfo: inline, narrow } = useWorkspaceViewport();
  const [open, setOpen] = useState(inline);
  return {
    inline,
    narrow,
    open,
    setOpen,
    toggle: () => setOpen((value) => !value),
  };
}
