import { useEffect } from "react";

const searchEvent = "dudu:inbox-search";
const queueEvent = "dudu:inbox-queue";

export function requestInboxSearch() {
  window.dispatchEvent(new Event(searchEvent));
}

export function requestInboxQueue() {
  window.dispatchEvent(new Event(queueEvent));
}

export function hasOpenOverlay(): boolean {
  return !!document.querySelector(
    '[data-slot="dialog-content"], [data-slot="sheet-content"], [data-slot="popover-content"], [data-slot="select-content"]',
  );
}

export function useInboxSearch(openQueue?: () => void) {
  useEffect(() => {
    function focusSearch() {
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
    function showQueue() {
      openQueue?.();
    }
    function handleKey(event: KeyboardEvent) {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "k" ||
        event.isComposing ||
        hasOpenOverlay()
      )
        return;
      event.preventDefault();
      focusSearch();
    }
    window.addEventListener("keydown", handleKey);
    window.addEventListener(searchEvent, focusSearch);
    window.addEventListener(queueEvent, showQueue);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener(searchEvent, focusSearch);
      window.removeEventListener(queueEvent, showQueue);
    };
  }, [openQueue]);
}
