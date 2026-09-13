import { type ChannelId, channelById } from "@/lib/channels";

import { type EventItem, latestVersion } from "./model";
import { type EventSchema, schemaById } from "./schemas";

/** 素材库筛选：搜索 + 渠道 + 类型（纯 selector，列表渲染交给 react-virtuoso） */
export type EventFilters = {
  query: string;
  channel: ChannelId | "all";
  kind: "all" | "message" | "event" | "favorite";
};

export const PAGE_SIZE = 10;

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

export type Page<T> = {
  items: T[];
  page: number;
  pages: number;
  total: number;
};

/** 分页（页码收敛到 [1, pages]；空列表为第 1 页）。页大小固定 PAGE_SIZE。 */
export function paginateEvents<T>(items: T[], page: number): Page<T> {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const clamped = Math.max(1, Math.min(page, pages));
  return {
    items: items.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE),
    page: clamped,
    pages,
    total: items.length,
  };
}
