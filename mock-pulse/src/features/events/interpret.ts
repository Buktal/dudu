import {
  REF_CONSEQUENCES,
  type RefConsequence,
  type RefStatusName,
  refEntryOf,
  refRowOf,
  refStatusForPresence,
} from "./consequences";
import { describeEventVersion, describeTemplateVersion } from "./resolve";

/**
 * 引用解析 interpreter（C1 的唯一深 module）。
 *
 * kernel（./resolve：describeEventVersion / describeTemplateVersion）回答「引用怎么了」
 * （ok / id-missing / version-missing），consequence 表（./consequences）回答「每个分类
 * 在各时钟里意味着什么」。本 module 是两者之上的唯一 interface：调用侧只传引用与时钟，
 * 拿回 {row, entry, blocks, missingKind, missing, outdated}，不再手写 status 分岔、
 * 不再自选 refRowOf / refEntryOf。
 *
 * seam 说明：新增引用形态 = 本 module 加一个 interpret* 函数；缺失语义变更 = 只改本
 * module 的查表映射；调用侧（runs 快照物化 / plans 编排物化 / scenarios 展示与校验）
 * 只剩薄 adapter——错误文案模板注入（措辞一字不动）与渠道一致性检查。
 *
 * 约定：events 不反向依赖任何 feature。本 module 只收结构化最小形状，
 * 素材库整行与校验侧的窄行（存在性引用走 interpretPresence）都能进。
 */

/** interpreter 时钟：consequence 表的 runtime / view / edit 三行。 */
export type InterpretClock = "runtime" | "view" | "edit";

/** 文案选用：调用时钟该用哪份既有错误文案（runtime.missingKind 语义，跨时钟稳定）。 */
export type InterpretMissingKind = "id" | "version" | null;

/**
 * 解释结果：调用侧消费本 interface。status 仅供测试断言 kernel→interpreter 一致，
 * 调用侧按 blocks / missingKind / missing / outdated 消费，不再按 status 分岔。
 */
export type InterpretedStep<Row, Entry> = {
  /** kernel 分类（ok / id-missing / version-missing），仅测试用。 */
  status: RefStatusName;
  /** 有行即带回：事件行 / 模板见证行（view.hasRow 语义，经 refRowOf 查表拿）。 */
  row: Row | undefined;
  /** 命中即带回：事件版本 / 钉住模板条目（view.hasEntry 语义，经 refEntryOf 查表拿）。 */
  entry: Entry | undefined;
  /** 本时钟是否拦截：runtime = 拒绝启动，edit = 拒绝保存，view 恒 false（只标记不拦）。 */
  blocks: boolean;
  /** 该用哪份既有文案，文案本体归调用时钟。 */
  missingKind: InterpretMissingKind;
  /** 展示缺失：事件 = 无行，模板 = 无条目，存在性引用 = 不存在。 */
  missing: boolean;
  /** 事件 ok 且落后即真；模板与存在性引用恒 false（版本钉住 / 无版本维度）。 */
  outdated: boolean;
};

/** 时钟→拦截门：runtime 问拒绝启动，edit 问各形态的保存门，view 不拦截。 */
function blocksFor(
  status: RefStatusName,
  clock: InterpretClock,
  editGate: (edit: RefConsequence["edit"]) => boolean,
): boolean {
  const consequence = REF_CONSEQUENCES[status];
  if (clock === "runtime") return consequence.runtime.blocks;
  if (clock === "edit") return editGate(consequence.edit);
  return false;
}

/**
 * 事件素材步骤解释：{eventId, revision} + 时钟 → 唯一词汇。
 * outdated 在本 module 内算定（ok 且落后才真），调用侧直接取用。
 */
export function interpretEventStep<
  E extends {
    readonly id: string;
    readonly versions: readonly { readonly revision: number }[];
  },
>(
  events: readonly E[],
  ref: { readonly eventId: string; readonly revision: number },
  clock: InterpretClock,
): InterpretedStep<E, E["versions"][number]> {
  const status = describeEventVersion(events, ref);
  const consequence = REF_CONSEQUENCES[status.status];
  const row = refRowOf(status);
  const entry = refEntryOf(status);
  const latest = row?.versions[row.versions.length - 1];
  const latestRevision = latest?.revision ?? 0;
  return {
    status: status.status,
    row,
    entry,
    blocks: blocksFor(status.status, clock, (edit) => edit.eventBlocksSave),
    missingKind: consequence.runtime.missingKind,
    // 事件展示缺失 = 无行：version-missing 带回行故不标 missing（行照常展示，
    // 拒绝启动是运行时钟的事）。
    missing: row === undefined,
    outdated:
      consequence.view.mayOutdate &&
      entry !== undefined &&
      latestRevision > ref.revision,
  };
}

/**
 * 内置模板步骤解释：{templateId, templateVersion} + 时钟 → 唯一词汇。
 * 版本钉住语义：未注册 id 与版本更替同样 missing（无条目即缺）。
 */
export function interpretTemplateStep<
  T extends { readonly id: string; readonly version: string },
>(
  templates: readonly T[],
  ref: { readonly templateId: string; readonly templateVersion: string },
  clock: InterpretClock,
): InterpretedStep<T, T> {
  const status = describeTemplateVersion(templates, ref);
  const consequence = REF_CONSEQUENCES[status.status];
  const entry = refEntryOf(status);
  return {
    status: status.status,
    row: refRowOf(status),
    entry,
    blocks: blocksFor(status.status, clock, (edit) => edit.templateBlocksSave),
    missingKind: consequence.runtime.missingKind,
    missing: entry === undefined,
    outdated: false,
  };
}

/**
 * 存在性引用解释：lane 剧本（快照优先解析命中与否）/ 编辑时钟窄行（只有 id 维度）
 * + 时钟 → 唯一词汇。只有 ok / id-missing 两态，四类 edit 门在此两态下同值
 * （ok 全放行、id-missing 全拦截），故两种存在性引用共用，无需再按形态分岔。
 */
export function interpretPresence(
  present: boolean,
  clock: InterpretClock,
): InterpretedStep<never, never> {
  const status = refStatusForPresence(present);
  const consequence = REF_CONSEQUENCES[status];
  return {
    status,
    row: undefined,
    entry: undefined,
    blocks: blocksFor(status, clock, (edit) => edit.laneBlocksSave),
    missingKind: consequence.runtime.missingKind,
    missing: !present,
    outdated: false,
  };
}
