import { useAppDispatch, useAppSelector } from "@/hooks/use-app-store";

import { savePlan } from "./stores/plan-library";
import { discardPlanDraft, selectPlanDirty } from "./stores/plans-slice";

/**
 * 编排草稿守卫事实的单点装配（DraftGuard 四件套：dirty / name / save /
 * discard）：App 内层守卫与编排视图守卫共用本 hook，不再各自手写域内
 * selector/action；组合根 view-behavior 注册表的编排条目沿用同一套
 * selectPlanDirty / savePlan / discardPlanDraft。
 */
export function usePlanDraftGuard() {
  const dispatch = useAppDispatch();
  const plans = useAppSelector((state) => state.plans);
  return {
    dirty: selectPlanDirty(plans),
    name: plans.draft?.name ?? "",
    save: () => dispatch(savePlan()).unwrap(),
    discard: () => dispatch(discardPlanDraft()),
  };
}
