import { invoke } from "@tauri-apps/api/core";

import type { EventItem } from "./model";

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
