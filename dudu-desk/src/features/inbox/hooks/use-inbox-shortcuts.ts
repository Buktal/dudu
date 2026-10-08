import { useIsPresent } from "motion/react";
import { useEffect } from "react";

export function hasOpenOverlay(): boolean {
  return !!document.querySelector(
    '[data-slot="dialog-content"], [data-slot="sheet-content"], [data-slot="popover-content"], [data-slot="select-content"], [data-slot="dropdown-menu-content"]',
  );
}

export function useInboxSearch(openQueue?: () => void) {
  const present = useIsPresent();
  useEffect(() => {
    if (!present) return;
    let searchFrame: number | undefined;
    function focusSearch() {
      openQueue?.();
      if (searchFrame !== undefined) cancelAnimationFrame(searchFrame);
      searchFrame = requestAnimationFrame(() => {
        const inputs = document.querySelectorAll<HTMLInputElement>(
          "[data-inbox-search]",
        );
        const input = Array.from(inputs).find(
          (element) =>
            !element.closest("[inert]") && element.getClientRects().length > 0,
        );
        input?.focus();
        input?.select();
        if (!input) {
          const trigger = Array.from(
            document.querySelectorAll<HTMLButtonElement>(
              "[data-inbox-filter-trigger]",
            ),
          ).find(
            (element) =>
              !element.closest("[inert]") &&
              element.getClientRects().length > 0,
          );
          trigger?.click();
        }
      });
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
    return () => {
      window.removeEventListener("keydown", handleKey);
      if (searchFrame !== undefined) cancelAnimationFrame(searchFrame);
    };
  }, [openQueue, present]);
}
