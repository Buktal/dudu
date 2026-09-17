import type { EventItem, EventVersion } from "./model";
import type { EventSchema } from "./schemas";

export {
  REF_CONSEQUENCES,
  type RefConsequence,
  type RefStatusName,
  refEntryOf,
  refRowOf,
  refStatusForPresence,
} from "./consequences";

/**
 * 引用解析 kernel（C2：查找与缺失含义同一模块，挂在引用数据的 events 域）。
 *
 * 下钻查找（resolve*）是内部接缝：{eventId, revision} → {事件, 版本}，
 * {templateId, templateVersion} → 模板。lane 剧本的行查找（快照优先）
 * 经 resolveRow 委托同一 kernel 的第一级，见 plans 域 resolveLaneScenario。
 * 三者共用同一 kernel（resolveRef），各自只剩形状适配的薄 adapter。
 * 任一缺失返回统一词汇，未命中含义（运行时钟抛错拒绝启动 / 展示时钟
 * missing·outdated 标记）由调用侧按 status 分岔。
 *
 * 统一词汇：ok = 行与版本双命中；id-missing = 注册表无此 id；
 * version-missing = id 在但钉住版本不在（row 带回同 id 见证行，
 * 事件侧为事件本体，模板侧为同 id 首个条目）。
 * 每个分类在各时钟里的后果（运行时钟拦不拦 / 展示时钟标什么 /
 * 编辑时钟存不存 / 守卫拦不拦删）收敛到本模块旁的 consequence 表
 * （./consequences，REF_CONSEQUENCES），各时钟查表不再按 status
 * 自行分岔；本 kernel 只回答「引用怎么了」。
 *
 * 约定：events 不反向依赖任何 feature。kernel 只收结构化最小形状，
 * 素材库整行与校验侧的窄行都能进；返回把调用方自己的行类型带回。
 */

/** 引用分类统一词汇（事件版本 / 模板版本共用同一形状） */
export type RefStatus<Row, Entry> =
  | { status: "ok"; row: Row; entry: Entry }
  | { status: "id-missing" }
  | { status: "version-missing"; row: Row };

/**
 * 单级行查找原语（kernel 的第一级）：按 id 找行。
 * plans 侧 lane 解析（Scenario 类型在 scenarios 域，不能搬进 events）
 * 以此为行查找原语留在 plans，只把“按 id 找行”委托给 kernel。
 */
export function resolveRow<Row extends { readonly id: string }>(
  rows: readonly Row[],
  id: string,
): Row | undefined {
  return rows.find((row) => row.id === id);
}

/**
 * 两级引用 kernel：按 id 找行 → 按版本找条目 → 统一分类。
 * 事件版本：entriesOf 取行内 versions，versionOf 取 revision；
 * 模板版本：注册表扁平（行即版本条目），entriesOf 取同 id 全体，
 * versionOf 取 version，命中的 entry 即钉住版本本体。
 */
export function resolveRef<Row extends { readonly id: string }, Entry>(
  rows: readonly Row[],
  ref: { readonly id: string; readonly version: string | number },
  shape: {
    entriesOf: (row: Row, rows: readonly Row[]) => readonly Entry[];
    versionOf: (entry: Entry) => string | number;
  },
): RefStatus<Row, Entry> {
  const row = resolveRow(rows, ref.id);
  if (!row) {
    return { status: "id-missing" };
  }
  const entry = shape
    .entriesOf(row, rows)
    .find((candidate) => shape.versionOf(candidate) === ref.version);
  if (!entry) {
    return { status: "version-missing", row };
  }
  return { status: "ok", row, entry };
}

/**
 * 步骤引用解析核心（runs 运行时钟 / scenarios 展示时钟共用的下钻单点）：
 * {eventId, revision} → {事件, 版本}。输入取结构子集，
 * 素材库整行与校验侧的窄行都能进。缺失语义（运行时钟抛错拒绝启动 /
 * 展示时钟 missing·outdated 标记）由调用侧按统一词汇决定，本函数只做查找。
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
  const status = describeEventVersion(events, ref);
  if (status.status === "ok") {
    return { event: status.row, version: status.entry };
  }
  if (status.status === "version-missing") {
    return { event: status.row, version: undefined };
  }
  return { event: undefined, version: undefined };
}

/**
 * 模板引用解析核心（与 resolveEventVersion 并列的模板下钻单点，ADR-0009）：
 * {templateId, templateVersion} → 模板。钉住语义的数据基础：注册表同一模板
 * 允许并存多个版本条目（升版 = 追加新条目，旧条目原样保留），按
 * id + version 精确匹配。缺失语义由调用侧按统一词汇决定，
 * 本函数只做查找。templates 不反向依赖任何 feature。
 */
export function resolveTemplateVersion<
  T extends { readonly id: string; readonly version: string },
>(
  templates: readonly T[],
  ref: { readonly templateId: string; readonly templateVersion: string },
): { template: T | undefined } {
  const status = describeTemplateVersion(templates, ref);
  return { template: status.status === "ok" ? status.entry : undefined };
}

/** 事件步骤引用分类：统一词汇的事件具名（row = 事件，entry = 版本） */
export type EventRefStatus<E = EventItem, V = EventVersion> = RefStatus<E, V>;

/**
 * 事件引用分类：{eventId, revision} → 统一词汇。输入取结构子集，
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
  return resolveRef(
    events,
    { id: ref.eventId, version: ref.revision },
    {
      entriesOf: (event) => event.versions,
      versionOf: (version) => version.revision,
    },
  );
}

/** 模板步骤引用分类：统一词汇的模板具名（row = 同 id 见证行，entry = 钉住版本） */
export type TemplateRefStatus<T = EventSchema> = RefStatus<T, T>;

/**
 * 模板引用分类：{templateId, templateVersion} → 统一词汇。id 未注册与版本
 * 更替是两种缺失（前者删步骤或等模板上架，后者重钉版本），调用侧借此
 * 分岔文案，不再各写一遍 some/filter。
 */
export function describeTemplateVersion<
  T extends { readonly id: string; readonly version: string },
>(
  templates: readonly T[],
  ref: { readonly templateId: string; readonly templateVersion: string },
): TemplateRefStatus<T> {
  return resolveRef(
    templates,
    { id: ref.templateId, version: ref.templateVersion },
    {
      entriesOf: (row, rows) =>
        rows.filter((candidate) => candidate.id === row.id),
      versionOf: (template) => template.version,
    },
  );
}
