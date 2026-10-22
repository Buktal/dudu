import { useIsPresent } from "motion/react";
import { useEffect } from "react";

/** 浮层容器选择器单点：快捷键守卫与卡片外点判定共用，新增浮层槽位只改这里。 */
export const OVERLAY_SELECTOR =
  '[data-slot="dialog-content"], [data-slot="sheet-content"], [data-slot="popover-content"], [data-slot="select-content"], [data-slot="dropdown-menu-content"]';

/** 事件目标落在任一浮层容器内：浮层内的指针与焦点移动不算作离开。 */
export function insideOverlay(node: Node): boolean {
  return node instanceof Element && !!node.closest(OVERLAY_SELECTOR);
}

export function hasOpenOverlay(): boolean {
  return !!document.querySelector(OVERLAY_SELECTOR);
}

/**
 * 工作台快捷键的单一键位映射：守卫（本模块）与帮助文案（workspace-help.tsx）
 * 共用这一份描述，新增或调整键位只改这里。
 */
export const INBOX_SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["Ctrl", "K"], label: "搜索访客或消息" },
  { keys: ["Enter"], label: "发送回复" },
  { keys: ["Shift", "Enter"], label: "输入框换行" },
  { keys: ["Ctrl", "Enter"], label: "发送并接待下一位" },
  { keys: ["Alt", "1 / 2"], label: "切换并排窗口" },
  { keys: ["Esc"], label: "关闭当前弹窗" },
];

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
