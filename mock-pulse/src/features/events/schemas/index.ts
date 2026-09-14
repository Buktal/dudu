/**
 * 事件模板模块的公共出口：类型 + 聚合注册表的两个取模板单点。
 * 各渠道协议元数据模块（douyin.ts / wecom.ts）仅在本目录内被注册表聚合，
 * 不对外导出——跨模块消费一律走 schemasByChannel / schemaById，无旁路引用。
 */
export { defineSchema } from "./define";
export {
  type ChannelTemplatePack,
  EVENT_SCHEMAS,
  schemaById,
  schemasByChannel,
} from "./registry";
export type {
  EventSchema,
  ExpectedReceipt,
  FieldDescriptor,
  FieldType,
  IdGeneration,
  IdKind,
  ReceiptBodyMode,
  SchemaProtocol,
  WireForm,
  WirePayload,
  XmlLayout,
} from "./types";
