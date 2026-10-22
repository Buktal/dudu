import { useAppDispatch, useAppSelector } from "@/hooks/use-app-store";

import {
  discardDraft,
  saveEvent,
  selectDraftDirty,
} from "./stores/events-slice";

/**
 * 事件草稿守卫事实的单点装配（DraftGuard 四件套：dirty / name / save /
 * discard）：App 内层守卫与事件视图守卫共用本 hook，不再各自手写域内
 * selector/action；组合根 view-behavior 注册表的事件条目沿用同一套
 * selectDraftDirty / saveEvent / discardDraft。
 */
export function useEventDraftGuard() {
  const dispatch = useAppDispatch();
  const events = useAppSelector((state) => state.events);
  return {
    dirty: selectDraftDirty(events),
    name: events.draft?.name ?? "",
    save: () => dispatch(saveEvent()).unwrap(),
    discard: () => dispatch(discardDraft()),
  };
}
