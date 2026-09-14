import type { ChannelDefinition } from "../definitions/loader";
import type { EventSchema, SchemaProtocol } from "./types";

/**
 * 协议元数据 + 版本化描述文件条目 → 完整事件模板。
 * version/source/fields 同源于描述文件；模板在描述文件中缺条目说明
 * 协议模块与文件脱节，装载即炸（数据契约，不带病运行）。
 * channelId 取自描述文件本身——协议模块声明渠道、文件校验渠道，两者合一。
 */
export function defineSchema(
  channel: ChannelDefinition,
  id: string,
  protocol: SchemaProtocol,
): EventSchema {
  const definition = channel.schemas[id];
  if (!definition) {
    throw new Error(
      `未知事件模板的字段定义：${id}（渠道 ${channel.channelId} 的描述文件缺少该条目）。`,
    );
  }
  return {
    id,
    channelId: channel.channelId,
    version: definition.version,
    source: definition.source,
    fields: definition.fields,
    ...protocol,
  };
}
