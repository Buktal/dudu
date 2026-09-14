import type { ChannelId } from "@/lib/channels";

import { DOUYIN_EVENT_SCHEMAS } from "./douyin";
import type { EventSchema } from "./types";
import { WECHAT_MP_EVENT_SCHEMAS } from "./wechat-mp";
import { WECOM_EVENT_SCHEMAS } from "./wecom";

/**
 * 事件模板聚合注册表：全仓库取模板仅此两个单点——
 * 「按渠道取模板」（schemasByChannel）与「按 id 取模板」（schemaById）。
 * 新渠道接入模板 = 渠道协议元数据模块 + 描述文件 + 此处一行 PACKS 数据；
 * 不在 PACKS 的渠道（尚未接入模板）返回空表，不抛错。
 */

/** 聚合注册表的一行：渠道 + 该渠道的全部内置模板 */
export type ChannelTemplatePack = {
  channel: ChannelId;
  schemas: readonly EventSchema[];
};

const PACKS: readonly ChannelTemplatePack[] = [
  { channel: "douyin", schemas: DOUYIN_EVENT_SCHEMAS },
  { channel: "wecom", schemas: WECOM_EVENT_SCHEMAS },
  { channel: "wechat-mp", schemas: WECHAT_MP_EVENT_SCHEMAS },
];

/** 聚合后的全部内置模板（契约校验与全量遍历用） */
export const EVENT_SCHEMAS: readonly EventSchema[] = PACKS.flatMap(
  (pack) => pack.schemas,
);

const SCHEMAS_BY_ID = new Map<string, EventSchema>(
  EVENT_SCHEMAS.map((schema) => [schema.id, schema]),
);

/** 按渠道取模板（单点）：未接入模板的渠道返回空表 */
export function schemasByChannel(channelId: ChannelId): readonly EventSchema[] {
  return (
    PACKS.find((pack) => pack.channel === channelId)?.schemas ?? EMPTY_SCHEMAS
  );
}

const EMPTY_SCHEMAS: readonly EventSchema[] = [];

/** 按 id 取模板（单点）：未命中说明调用与注册表脱节，抛出明确错误 */
export function schemaById(id: string): EventSchema {
  const found = SCHEMAS_BY_ID.get(id);
  if (!found) {
    throw new Error(`未知事件模板：${id}`);
  }
  return found;
}
