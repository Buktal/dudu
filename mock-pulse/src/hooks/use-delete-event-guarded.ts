import { useCallback } from "react";
import { useStore } from "react-redux";

import { deleteEvent } from "@/features/events";
import { scenarioNamesReferencingEvent } from "@/features/scenarios";
import type { RootState } from "@/store";

import { useAppDispatch } from "./use-app-store";

/**
 * 组合根编排 hook：仅由 App 调用，再把回调注入 events；feature 不导入本模块。
 * 「先查剧本引用再删事件」的用例编排在组合根完成：
 * 被「平台剧本」引用的事件拒绝删除（可读错误），未引用则转发 events 域删除流程。
 * events 域对 scenarios 零感知——event-editor 只接收注入的守卫回调。
 */
export function useDeleteEventGuarded(): (eventId: string) => Promise<void> {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();

  return useCallback(
    async (eventId: string) => {
      const referencing = scenarioNamesReferencingEvent(
        store.getState(),
        eventId,
      );
      if (referencing.length > 0) {
        const names = referencing.map((name) => `「${name}」`).join("、");
        throw new Error(
          `事件被剧本引用：${names}。先删除或调整剧本，再删除事件。`,
        );
      }
      await dispatch(deleteEvent(eventId)).unwrap();
    },
    [dispatch, store],
  );
}
