import { invoke } from "@tauri-apps/api/core";

import type { EventItem } from "./model";
import type { FieldDescriptor } from "./schemas";

/** 读取本地持久化的全部事件（Rust 端 events.json） */
export function loadEvents(): Promise<EventItem[]> {
  return invoke<EventItem[]>("events_load");
}

/** 保存单条事件（按 id 覆盖），返回保存后的完整列表 */
export function saveEvent(event: EventItem): Promise<EventItem[]> {
  return invoke<EventItem[]>("events_save", { event });
}

/** 按 id 删除事件，返回删除后的完整列表 */
export function deleteEventById(eventId: string): Promise<EventItem[]> {
  return invoke<EventItem[]>("events_delete", { eventId });
}

/** 单个事件模板的用户字段定义（camelCase 契约，与 Rust StoredSchemaDefinition 对应） */
export type StoredSchemaDefinition = {
  schemaId: string;
  /** 定义编辑时所依据的描述符版本 */
  version: string;
  fields: FieldDescriptor[];
};

/** 全部用户字段定义：{schemas:{<schemaId>:定义}} */
export type DefinitionsDoc = {
  schemas: Record<string, StoredSchemaDefinition>;
};

/** 读取全部用户字段定义（Rust 端 field-definitions.json；无文件为空 schemas） */
export function loadDefinitions(): Promise<DefinitionsDoc> {
  return invoke<DefinitionsDoc>("definitions_load");
}

/** 按 schemaId 整体覆写用户字段定义，返回保存后的完整文档 */
export function saveDefinition(
  schemaId: string,
  definition: StoredSchemaDefinition,
): Promise<DefinitionsDoc> {
  return invoke<DefinitionsDoc>("definitions_save", { schemaId, definition });
}
