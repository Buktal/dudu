import { useCallback } from "react";
import { useStore } from "react-redux";

import { deleteEvent, interpretPresence } from "@/features/events";
import { fetchPlans, planNamesReferencingEvent } from "@/features/plans";
import {
  fetchScenarios,
  scenarioNamesReferencingEvent,
} from "@/features/scenarios";
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
      if (!store.getState().scenarios.loaded) {
        await dispatch(fetchScenarios()).unwrap();
      }
      if (!store.getState().plans.loaded) await dispatch(fetchPlans()).unwrap();
      const pinnedPlans = planNamesReferencingEvent(
        store.getState().plans,
        eventId,
      );
      // 守卫时钟问 interpreter（events 域唯一分岔点）：有引用（ok）即拦删，
      // 无引用（id-missing）放行；引用按 id 匹配，落后 revision 同样拦
      // （文案一字不动）。
      if (interpretPresence(pinnedPlans.length > 0, "guard").blocks)
        throw new Error(
          `事件仍被编排快照引用：${pinnedPlans.map((name) => `「${name}」`).join("、")}。先同步或移除对应剧本，再删除事件。`,
        );
      const referencing = scenarioNamesReferencingEvent(
        store.getState(),
        eventId,
      );
      if (interpretPresence(referencing.length > 0, "guard").blocks) {
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
