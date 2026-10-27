/**
 * 浮层容器选择器单点：快捷键守卫与卡片外点判定共用，新增浮层槽位只改这里。
 * 选择器与谓词放在 lib 叶子模块：接待快捷键与悬浮助手快捷键共用同一份浮层
 * 词表，避免 assistant 与 inbox 两个 feature 相互引用。
 */
export const OVERLAY_SELECTOR =
  '[data-slot="dialog-content"], [data-slot="sheet-content"], [data-slot="popover-content"], [data-slot="select-content"], [data-slot="dropdown-menu-content"], [data-desk-assistant]';

/** 当前在册的浮层容器：守卫判定统一从这里取节点，不再各自查询。 */
export function openOverlays(): Element[] {
  return Array.from(document.querySelectorAll(OVERLAY_SELECTOR));
}

/** 事件目标落在任一浮层容器内：浮层内的指针与焦点移动不算作离开。 */
export function insideOverlay(node: Node): boolean {
  return node instanceof Element && !!node.closest(OVERLAY_SELECTOR);
}

export function hasOpenOverlay(): boolean {
  return openOverlays().length > 0;
}

/**
 * 助手快捷键（Alt+A）的浮层守卫：其他浮层占用时不抢键；助手自身展开
 * （要能收起）与内嵌助手宿主的浮层（quick 历史弹层的宿主挂在弹层内容上）
 * 不算占用。
 */
export function hasAssistantBlockingOverlay(): boolean {
  return openOverlays().some(
    (overlay) =>
      !overlay.hasAttribute("data-desk-assistant") &&
      !overlay.matches("[data-desk-assistant-host]") &&
      !overlay.querySelector("[data-desk-assistant-host]"),
  );
}
