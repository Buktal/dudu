import { useIsPresent } from "motion/react";
import { useEffect } from "react";
import { findFocusable } from "@/lib/focus";
import { hasOpenOverlay } from "@/lib/overlay";

/**
 * 工作台快捷键的帮助文案键位清单（workspace-help.tsx）：展示用字符串，不是
 * 机器可执行的绑定；键位守卫在各交互组件内联（搜索守卫在本模块硬编码 Ctrl+K，
 * 与第一项一致），新增或调整键位时同步这里与对应守卫。
 */
export const INBOX_SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["Ctrl", "K"], label: "搜索访客或消息" },
  { keys: ["Enter"], label: "发送回复" },
  { keys: ["Shift", "Enter"], label: "输入框换行" },
  { keys: ["Ctrl", "Enter"], label: "发送并接待下一位" },
  { keys: ["Alt", "1 / 2"], label: "切换并排窗口" },
  { keys: ["Alt", "A"], label: "展开或收起 AI 助手" },
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
        const input = findFocusable<HTMLInputElement>("[data-inbox-search]");
        input?.focus();
        input?.select();
        if (!input)
          findFocusable<HTMLButtonElement>(
            "[data-inbox-filter-trigger]",
          )?.click();
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
