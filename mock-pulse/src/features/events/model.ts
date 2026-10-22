import type { ChannelId } from "@/lib/channels";

import { applyGeneratedIds } from "./ids";
import { editorPayload, wirePayload } from "./payload/json";
import { cloneJson } from "./payload-value";
import { latestVersionOf } from "./reference";
import type { EventSchema, ExpectedReceipt, WirePayload } from "./schemas";
import { schemaById } from "./schemas";

/**
 * 事件素材领域模型：Event = {id, name, channelId, 事件类型, versions[]}。
 * 保存 = 追加不可变版本（保存时间 + 来源草稿快照）；旧版本可回看。
 */

// 期望回执的正文形态与结构是模板三件套之一，类型单点在 schemas（随模板声明）；
// 此处沿用原公开 API 从 model 再导出。
export type { ExpectedReceipt, ReceiptBodyMode } from "./schemas";

/** 兜底期望回执（无版本旧数据装载缺期望时的空形态：仅看状态码，不校验正文） */
export const DEFAULT_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: "",
  bodyMode: "contains",
};

export type EventVersion = {
  /** 从 1 递增，等于在 versions 中的序号 + 1 */
  revision: number;
  /** 保存时间（ISO） */
  savedAt: string;
  /** 来源草稿快照（线上形态：contentString 模板的 content 为 JSON 字符串） */
  payload: WirePayload;
  expected: ExpectedReceipt;
};

export type EventItem = {
  id: string;
  name: string;
  channelId: ChannelId;
  schemaId: string;
  favorite?: boolean;
  /** 只追加，不修改：旧版本内容不变 */
  versions: EventVersion[];
};

/** 编辑器草稿：payload 为表单形态（contentString 已解析为对象） */
export type EventDraft = {
  id: string;
  name: string;
  channelId: ChannelId;
  schemaId: string;
  favorite?: boolean;
  payload: WirePayload;
  /** 发送者 ID 显式同步开关 */
  senderSync: boolean;
  /** 直发比对用的期望回执；保存时随版本落盘 */
  expected: ExpectedReceipt;
};

let idCounter = 0;

export function newEventId(): string {
  idCounter += 1;
  return `evt-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

/** 从内置模板新建事件草稿：ID 默认值按官方形态生成、期望回执取渠道真实默认。 */
export function createDraft(name: string, schema: EventSchema): EventDraft {
  return {
    id: newEventId(),
    name,
    channelId: schema.channelId,
    schemaId: schema.id,
    payload: applyGeneratedIds(schema, schema.payload),
    senderSync: false,
    expected: { ...schema.expected },
  };
}

/** 复制 = 新事件携带当前版本载荷草稿。 */
export function duplicateDraft(draft: EventDraft): EventDraft {
  return {
    ...draft,
    id: newEventId(),
    name: `${draft.name} · 副本`,
    payload: cloneJson(draft.payload),
  };
}

/** 最新版本（零版本行为 undefined）：取尖单点在 reference 域 latestVersionOf。 */
export function latestVersion(event: EventItem): EventVersion | undefined {
  return latestVersionOf(event);
}

// 步骤引用解析核心住在 ./reference/resolve（C4：查找与缺失含义同一模块）；
// 经此处再导出供 model.test.ts，域外门面改从 ./reference 直取。
export { resolveEventVersion, resolveTemplateVersion } from "./reference";

/** 装载已保存事件为草稿：基于最新版本。 */
export function draftFromItem(event: EventItem): EventDraft {
  const schema = schemaById(event.schemaId);
  const latest = latestVersion(event);
  return {
    id: event.id,
    name: event.name,
    channelId: event.channelId,
    schemaId: event.schemaId,
    favorite: event.favorite ?? false,
    payload: latest
      ? editorPayload(schema, latest.payload)
      : cloneJson(schema.payload),
    senderSync: false,
    expected: latest ? { ...latest.expected } : { ...schema.expected },
  };
}

/** 草稿与已保存事件（最新版本 + 名称）是否有差异。 */
export function isDraftDirty(
  event: EventItem | null,
  draft: EventDraft,
): boolean {
  if (!event) return true;
  if (event.name !== draft.name) return true;
  if (!!event.favorite !== !!draft.favorite) return true;
  const schema = schemaById(event.schemaId);
  const latest = latestVersion(event);
  if (!latest) return true;
  if (stableStringify(latest.expected) !== stableStringify(draft.expected)) {
    return true;
  }
  return (
    stableStringify(editorPayload(schema, latest.payload)) !==
    stableStringify(draft.payload)
  );
}

/**
 * 保存草稿为不可变新版本：返回新 EventItem，versions 追加，
 * 旧版本对象原样共享（内容不变）。期望回执取草稿当前编辑值。
 */
export function appendVersion(
  event: EventItem | null,
  draft: EventDraft,
  savedAt: string,
): EventItem {
  const schema = schemaById(draft.schemaId);
  const previous = event ? latestVersion(event) : undefined;
  const version: EventVersion = {
    revision: previous ? previous.revision + 1 : 1,
    savedAt,
    payload: wirePayload(schema, draft.payload),
    expected: { ...draft.expected },
  };
  return {
    id: draft.id,
    name: draft.name,
    channelId: draft.channelId,
    schemaId: draft.schemaId,
    favorite: draft.favorite ?? false,
    versions: [...(event?.versions ?? []), version],
  };
}

/** 键序无关的稳定序列化（脏比较用）。 */
function stableStringify(value: unknown): string {
  if (value == null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
