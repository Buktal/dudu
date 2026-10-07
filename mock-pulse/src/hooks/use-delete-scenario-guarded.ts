import { useCallback } from "react";
import { useStore } from "react-redux";

import { interpretPresence } from "@/features/events";
import { fetchPlans, planNamesReferencingScenario } from "@/features/plans";
import { deleteScenario } from "@/features/scenarios";
import type { RootState } from "@/store";

import { useAppDispatch } from "./use-app-store";

/**
 * 组合根编排 hook：仅由 App 调用，再把回调注入 scenarios；feature 不导入本模块。
 * 「先查编排引用再删剧本」的用例编排在组合根完成：
 * 被「执行编排」引用的剧本拒绝删除（可读错误），未引用则转发 scenarios 域删除流程。
 * 编排库未装载时先拉一次（本会话没打开过编排视图时内存列表为空，直接查会漏拦）。
 * scenarios 域对 plans 零感知——scenario-editor 只消费注入的删除回调。
 */
export function useDeleteScenarioGuarded(): (
  scenarioId: string,
) => Promise<void> {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();

  return useCallback(
    async (scenarioId: string) => {
      if (!store.getState().plans.loaded) {
        await dispatch(fetchPlans()).unwrap();
      }
      const referencing = planNamesReferencingScenario(
        store.getState(),
        scenarioId,
      );
      // 守卫时钟问 interpreter（events 域唯一分岔点）：有引用（ok）即拦删，
      // 无引用（id-missing）放行（文案一字不动）。
      if (interpretPresence(referencing.length > 0, "guard").blocks) {
        const names = referencing.map((name) => `「${name}」`).join("、");
        throw new Error(
          `剧本被编排引用：${names}。先删除或调整编排，再删除剧本。`,
        );
      }
      await dispatch(deleteScenario(scenarioId)).unwrap();
    },
    [dispatch, store],
  );
}
