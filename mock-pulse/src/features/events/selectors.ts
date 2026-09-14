import { type ChannelId, channelById } from "@/lib/channels";
import { type Page, paginate as paginateEvents } from "@/lib/paginate";

import type { StoredSchemaDefinition } from "./api";
import { type EventDraft, type EventItem, latestVersion } from "./model";
import { type EventSchema, schemaById } from "./schemas";
import type { EventsState, FieldDefinitionsState } from "./stores/events-slice";

/** 素材库筛选：搜索 + 渠道 + 类型（纯 selector，列表渲染交给 react-virtuoso） */
export type EventFilters = {
  query: string;
  channel: ChannelId | "all";
  kind: "all" | "message" | "event" | "favorite";
};

export type EventRow = {
  item: EventItem;
  /** schema 未注册（如未来渠道的旧数据）时为 undefined */
  schema: EventSchema | undefined;
  /** 最新版本（无版本的事件为 undefined） */
  updatedAt: string;
};

function trySchema(schemaId: string): EventSchema | undefined {
  try {
    return schemaById(schemaId);
  } catch {
    return undefined;
  }
}

function searchableText(row: EventRow): string {
  const parts = [
    row.item.name,
    row.item.channelId,
    channelById(row.item.channelId)?.name ?? "",
    row.item.schemaId,
    row.schema?.name ?? "",
    row.schema?.eventName ?? "",
  ];
  return parts.join(" ").toLowerCase();
}

/**
 * 筛选 + 排序：按最新版本保存时间倒序（未保存过版本的事件按原顺序排前）。
 */
export function filterEvents(
  items: EventItem[],
  filters: EventFilters,
): EventRow[] {
  const rows: EventRow[] = items.map((item) => ({
    item,
    schema: trySchema(item.schemaId),
    updatedAt: latestVersion(item)?.savedAt ?? "",
  }));
  const query = filters.query.trim().toLowerCase();
  const matched = rows.filter((row) => {
    if (filters.channel !== "all" && row.item.channelId !== filters.channel) {
      return false;
    }
    if (
      filters.kind !== "all" &&
      filters.kind !== "favorite" &&
      (row.schema?.kind ?? "message") !== filters.kind
    ) {
      return false;
    }
    if (filters.kind === "favorite" && !row.item.favorite) return false;
    return query === "" || searchableText(row).includes(query);
  });
  return matched.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** 分页：转发 lib 泛型实现（页码收敛到 [1, pages]；空列表为第 1 页）。 */
export { type Page, paginateEvents };

// ---- 只读 selector：从 stores/events-slice 下沉（slice 文件只留状态机与簿记）----

export function selectEvents(state: EventsState): EventItem[] {
  return state.items;
}

export function selectDraft(state: EventsState): EventDraft | null {
  return state.draft;
}

export function selectFilters(state: EventsState): EventFilters {
  return state.filters;
}

export function selectPage(state: EventsState): number {
  return state.page;
}

export function selectSelectedId(state: EventsState): string | null {
  return state.selectedId;
}

export function selectLoaded(state: EventsState): boolean {
  return state.loaded;
}

/** 全部用户字段定义 */
export function selectFieldDefinitions(
  state: EventsState,
): FieldDefinitionsState {
  return state.definitions;
}

/** 指定模板的用户字段定义（表单合并与字典弹窗的读取入口） */
export function selectSchemaUserDefinition(
  state: EventsState,
  schemaId: string,
): StoredSchemaDefinition | undefined {
  return state.definitions.bySchemaId[schemaId];
}

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
