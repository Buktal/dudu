import { useEffect, useRef, useState } from "react";

// 服务端查询契约的搜索词条上限（DeskVisitorQueryDTO.SEARCH_MAX_LENGTH）
export const SEARCH_MAX_LENGTH = 100;

// 搜索提交防抖时限：停顿后自动提交，回车立即提交
const SEARCH_DEBOUNCE_MS = 250;

/**
 * 搜索输入的「草稿-提交」编排（与 DuduAdmin FilterBar 同族词汇）：
 * 输入只改草稿，防抖停顿或回车才把去空格后的词条提交给查询；
 * 草稿跟随已应用值，外部清除筛选时一并回空。提交回调按最新渲染闭包调用，
 * 防抖等待期间其他筛选的即时变化不会被旧闭包回滚。
 */
export function useSearchDraft(
  applied: string,
  commit: (keyword: string) => void,
) {
  const [draft, setDraft] = useState(applied);
  useEffect(() => setDraft(applied), [applied]);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const keyword = draft.trim();
    if (keyword === applied) return;
    timerRef.current = setTimeout(
      () => commitRef.current(keyword),
      SEARCH_DEBOUNCE_MS,
    );
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [draft, applied]);
  return {
    draft,
    onChange: (value: string) => setDraft(value),
    onEnter: () => {
      // 回车立即提交并取消等待中的防抖，同一词条不提交两次
      if (timerRef.current) clearTimeout(timerRef.current);
      commitRef.current(draft.trim());
    },
  };
}
