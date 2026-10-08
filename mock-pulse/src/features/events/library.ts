import { type ChannelId, channelById } from "@/lib/channels";
import { type Page, paginate as paginateEvents } from "@/lib/paginate";

import { type EventItem, latestVersion } from "./model";
import {
  EVENT_SCHEMAS,
  type EventSchema,
  schemaById,
  schemasByChannel,
} from "./schemas";
import type { EventFilters } from "./stores/events-slice";

/** 列表筛选词汇：定义在 stores/events-slice，随本模块的筛选入口再导出。 */
export type { EventFilters };

/**
 * 素材库列表 view-model（评审 C1 自 selectors 拆出）：事件素材行 /
 * 事件模板行的行模型、筛选排序、分页与「列表即目录」（ADR-0009）组合。
 * 这是给界面的行装配，不是状态读取 selector——selectors.ts 只留状态
 * selector 与兼容再导出，存量 `../selectors` 导入不断。
 */

export type EventRow = {
  region: "user";
  item: EventItem;
  /** schema 未注册（如未来渠道的旧数据）时为 undefined */
  schema: EventSchema | undefined;
  /** 最新版本（无版本的事件为 undefined） */
  updatedAt: string;
};

/** 模板区一行：内置模板（点击即以模板开草稿，不落库） */
export type TemplateRow = {
  region: "template";
  schema: EventSchema;
};

/** 素材库列表行：模板区在前（列表即目录），用户素材区在后 */
export type LibraryRow = TemplateRow | EventRow;

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
    region: "user",
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

// ---- 模板区（列表即目录，ADR-0009）：素材库列表在用户素材前展示内置模板 ----

/** 目录模板源：渠道筛选收敛模板范围（全部 = 全渠道已接入模板；未接入渠道为空表） */
export function templatesForChannel(
  channel: ChannelId | "all",
): readonly EventSchema[] {
  return channel === "all" ? EVENT_SCHEMAS : schemasByChannel(channel);
}

/** 模板区分组序：消息在前、事件在后（稳定排序保持注册表内声明序） */
function kindOrder(kind: EventSchema["kind"]): number {
  return kind === "message" ? 0 : 1;
}

function templateSearchableText(schema: EventSchema): string {
  const parts = [
    schema.name,
    schema.eventName,
    schema.id,
    schema.channelId,
    channelById(schema.channelId)?.name ?? "",
  ];
  return parts.join(" ").toLowerCase();
}

/**
 * 模板区筛选：kind 过滤（收藏只作用于用户素材，模板区恒空）+ 关键词
 * 命中名称/官方事件名/模板 id/渠道；返回序固定消息分组在前。
 */
export function filterTemplates(
  templates: readonly EventSchema[],
  filters: EventFilters,
): TemplateRow[] {
  const query = filters.query.trim().toLowerCase();
  return templates
    .filter((schema) => {
      if (filters.kind === "favorite") return false;
      if (
        (filters.kind === "message" || filters.kind === "event") &&
        schema.kind !== filters.kind
      ) {
        return false;
      }
      return query === "" || templateSearchableText(schema).includes(query);
    })
    .sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind))
    .map((schema) => ({ region: "template" as const, schema }));
}

/**
 * 列表即目录（ADR-0009）：完整列表 = 模板区在前（消息 → 事件分组，
 * 点击即以模板开草稿不落库）+ 用户素材区在后（保存时间倒序）。
 * 搜索与 kind 过滤同时作用于两个区，分页选择器覆盖组合列表。
 */
export function libraryRows(
  items: EventItem[],
  templates: readonly EventSchema[],
  filters: EventFilters,
): LibraryRow[] {
  return [
    ...filterTemplates(templates, filters),
    ...filterEvents(items, filters),
  ];
}
