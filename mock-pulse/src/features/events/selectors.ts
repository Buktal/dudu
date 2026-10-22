import type { ChannelId } from "@/lib/channels";

import type { EventFilters, EventsState } from "./stores/events-slice";

export type { EventFilters };

/**
 * 只读 selector facade：取值实现住 stores/events-slice（状态定义处），
 * 此处只留重导出，存量 `../selectors` 导入不断；跨 feature 的 RootState 形适配
 *（selectDraftChannelId / selectDraftId）仍在此定义。
 * 素材库列表 view-model（行模型、筛选、分页）已归 ./library（评审 C1），
 * 此处留同形再导出，存量 `../selectors` 导入不断。
 */

export {
  type EventRow,
  filterEvents,
  filterTemplates,
  type LibraryRow,
  libraryRows,
  type Page,
  paginateEvents,
  type TemplateRow,
  templatesForChannel,
} from "./library";
export {
  selectDraft,
  selectEvents,
  selectFieldDefinitions,
  selectFilters,
  selectHiddenUnregistered,
  selectLoaded,
  selectPage,
  selectSchemaUserDefinition,
  selectSelectedId,
} from "./stores/events-slice";

/** 当前草稿渠道（跨 feature 消费：直发面板的未配置指引按渠道呈现）。
 *  入参收 RootState 形状（含 events 键即可），避免外部直读 draft 形状。 */
export function selectDraftChannelId(
  state: EventsState | { events: EventsState },
): ChannelId | undefined {
  const events = "events" in state ? state.events : state;
  return events.draft?.channelId;
}

/** 当前草稿 id（跨 feature 消费：直发面板随编辑对象切换复位）。
 *  入参收 RootState 形状（含 events 键即可）。 */
export function selectDraftId(
  state: EventsState | { events: EventsState },
): string | null {
  const events = "events" in state ? state.events : state;
  return events.draft?.id ?? null;
}
