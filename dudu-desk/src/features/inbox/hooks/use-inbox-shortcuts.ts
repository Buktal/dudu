import { useEffect } from "react";

export function hasOpenOverlay(): boolean {
  return !!document.querySelector(
    '[data-slot="dialog-content"], [data-slot="sheet-content"], [data-slot="popover-content"], [data-slot="select-content"]',
  );
}

export function useInboxSearch(openQueue?: () => void) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "k" ||
        event.isComposing ||
        hasOpenOverlay()
      )
        return;
      event.preventDefault();
      openQueue?.();
      requestAnimationFrame(() => {
        const inputs = document.querySelectorAll<HTMLInputElement>(
          "[data-inbox-search]",
        );
        const input = Array.from(inputs).find(
          (element) => element.getClientRects().length > 0,
        );
        input?.focus();
        input?.select();
      });
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [openQueue]);
}
