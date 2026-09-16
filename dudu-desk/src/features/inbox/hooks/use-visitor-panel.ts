import { useState, useSyncExternalStore } from "react";

const breakpoint = "(min-width: 1091px)";
const getInline = () => window.matchMedia?.(breakpoint).matches ?? false;
const getServerInline = () => false;

function subscribe(listener: () => void) {
  const media = window.matchMedia?.(breakpoint);
  media?.addEventListener("change", listener);
  return () => media?.removeEventListener("change", listener);
}

export function useVisitorPanel() {
  const inline = useSyncExternalStore(subscribe, getInline, getServerInline);
  const [open, setOpen] = useState(inline);
  return { inline, open, setOpen, toggle: () => setOpen((value) => !value) };
}
