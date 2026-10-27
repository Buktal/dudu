/**
 * 「可见且非 inert」的聚焦候选判定与查找：inert 子树与没有布局盒
 * （display:none、未挂载等）的元素不接收焦点。工作台快捷键、AI 助手草稿
 * 聚焦与并排窗格聚焦共用这一份判定，新增聚焦入口不再各自复制谓词。
 */

/** 元素可接收焦点：不在 inert 子树内且当前有布局盒。 */
export function isFocusable(element: Element): boolean {
  return !element.closest("[inert]") && element.getClientRects().length > 0;
}

/** 在文档中按选择器查找第一个可聚焦的元素；无可聚焦元素时返回 undefined。 */
export function findFocusable<E extends Element = Element>(
  selector: string,
): E | undefined {
  return Array.from(document.querySelectorAll<E>(selector)).find(isFocusable);
}
