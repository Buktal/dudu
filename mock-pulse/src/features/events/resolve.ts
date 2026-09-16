import type { EventItem, EventVersion } from "./model";
import type { EventSchema } from "./schemas";

/**
 * 引用解析单点（C4：查找与缺失含义住在一起，挂在引用数据的 events 域）。
 *
 * 下钻查找（resolve*）是内部接缝：{eventId, revision} → {事件, 版本}，
 * {templateId, templateVersion} → 模板。任一缺失返回 undefined。
 * 分类（describe*）是含义层：调用时钟借此分岔 consequence，
 * 不再各写一遍 some/filter/find。
 *
 * 约定：分类函数只回答「引用怎么了」，时钟 consequence（抛错文案 / 行标
 * 记）仍归各时钟——run 时钟要第 N 步前缀，view 时钟要 outdated 标记，
 * 这些是时钟的事，不是引用的事。
 */

/**
 * 步骤引用解析核心（runs 运行时钟 / scenarios 展示时钟共用的下钻单点）：
 * {eventId, revision} → {事件, 版本}。输入取结构子集，
 * 素材库整行与校验侧的窄行都能进；返回把调用方自己的行类型带回。
 * 缺失语义（运行时钟抛错拒绝启动 / 展示时钟 missing·outdated 标记）
 * 由调用侧经 describeEventVersion 决定，本函数只做查找。
 * events 不反向依赖任何 feature。
 */
export function resolveEventVersion<
  E extends {
    readonly id: string;
    readonly versions: readonly { readonly revision: number }[];
  },
>(
  events: readonly E[],
  ref: { readonly eventId: string; readonly revision: number },
): { event: E | undefined; version: E["versions"][number] | undefined } {
  const event = events.find((item) => item.id === ref.eventId);
  const version = event?.versions.find(
    (candidate) => candidate.revision === ref.revision,
  );
  return { event, version };
}

/**
 * 模板引用解析核心（与 resolveEventVersion 并列的模板下钻单点，ADR-0009）：
 * {templateId, templateVersion} → 模板。钉住语义的数据基础：注册表同一模板
 * 允许并存多个版本条目（升版 = 追加新条目，旧条目原样保留），按
 * id + version 精确匹配。缺失语义由调用侧经 describeTemplateVersion 决定，
 * 本函数只做查找。templates 不反向依赖任何 feature。
 */
export function resolveTemplateVersion<
  T extends { readonly id: string; readonly version: string },
>(
  templates: readonly T[],
  ref: { readonly templateId: string; readonly templateVersion: string },
): { template: T | undefined } {
  const template = templates.find(
    (candidate) =>
      candidate.id === ref.templateId &&
      candidate.version === ref.templateVersion,
  );
  return { template };
}

/** 事件步骤引用分类：ok / 事件没了 / 事件在但钉住的版本没了 */
export type EventRefStatus<E = EventItem, V = EventVersion> =
  | { status: "ok"; event: E; version: V }
  | { status: "event-missing" }
  | { status: "revision-missing"; event: E };

/**
 * 事件引用分类：{eventId, revision} → 状态。输入取结构子集，
 * 素材库整行与校验侧的窄行都能进；返回把调用方自己的行类型带回。
 */
export function describeEventVersion<
  E extends {
    readonly id: string;
    readonly versions: readonly { readonly revision: number }[];
  },
>(
  events: readonly E[],
  ref: { readonly eventId: string; readonly revision: number },
): EventRefStatus<E, E["versions"][number]> {
  const { event, version } = resolveEventVersion(events, ref);
  if (!event) return { status: "event-missing" };
  if (!version) return { status: "revision-missing", event };
  return { status: "ok", event, version };
}

/** 模板步骤引用分类：ok / id 未注册 / id 在但钉住版本不在注册表 */
export type TemplateRefStatus<T = EventSchema> =
  | { status: "ok"; template: T }
  | { status: "template-missing" }
  | { status: "version-missing" };

/**
 * 模板引用分类：{templateId, templateVersion} → 状态。id 未注册与版本
 * 更替是两种缺失（前者删步骤或等模板上架，后者重钉版本），调用侧借此
 * 分岔文案，不再各写一遍 some/filter。
 */
export function describeTemplateVersion<
  T extends { readonly id: string; readonly version: string },
>(
  templates: readonly T[],
  ref: { readonly templateId: string; readonly templateVersion: string },
): TemplateRefStatus<T> {
  const { template } = resolveTemplateVersion(templates, ref);
  if (template) return { status: "ok", template };
  const registered = templates.some((item) => item.id === ref.templateId);
  return registered
    ? { status: "version-missing" }
    : { status: "template-missing" };
}
