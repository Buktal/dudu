import {
  REF_CONSEQUENCES,
  type RefConsequence,
  type RefStatusName,
  refEntryOf,
  refRowOf,
} from "./consequences";
import {
  describeEventVersion,
  describeTemplateVersion,
  latestVersionOf,
} from "./resolve";

/**
 * 引用解析 interpreter（C1 的唯一深 module，也是 events 域引用解析的唯一出口：
 * kernel 与 consequence 表均已退回域内私有，门面只导出 interpret*）。
 *
 * kernel（./resolve：describeEventVersion / describeTemplateVersion）回答「引用怎么了」
 * （ok / id-missing / version-missing），consequence 表（./consequences）回答「每个分类
 * 在各时钟里意味着什么」。本 module 是两者之上的唯一 interface：调用侧只传引用与时钟，
 * 拿回 {row, entry, blocks, missingKind, missing, outdated}，不再手写 status 分岔、
 * 不再自选 refRowOf / refEntryOf、不再直查 REF_CONSEQUENCES。
 *
 * seam 说明：新增引用形态 = 本 module 加一个 interpret* 函数；缺失语义变更 =
 * 引用形态（事件素材 / 事件模板版本）只改 consequence 表一行，存在性
 * （presence）形态语义在本 module 单点（interpretPresence），调用侧不动。
 * 调用侧（runs 快照物化 / plans 编排物化与统计 /
 * scenarios 展示与校验 / 组合根删除守卫）只剩薄 adapter——错误文案模板注入
 * （措辞一字不动）与渠道一致性检查。归位：kernel、consequence 表与本 module
 * 一并住 ./reference（评审 C1），reference/index.ts 是子系统的域内出口。
 *
 * 约定：events 不反向依赖任何 feature。本 module 只收结构化最小形状，
 * 素材库整行与校验侧的窄行（存在性引用走 interpretPresence）都能进。
 */

/** interpreter 时钟：consequence 表的 runtime / view / edit / guard 四行。 */
export type InterpretClock = "runtime" | "view" | "edit" | "guard";

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
  /**
   * 本时钟是否拦截：runtime = 拒绝启动，edit = 拒绝保存，
   * guard = 拒绝删除，view 恒 false（只标记不拦）。
   */
  blocks: boolean;
  /** 该用哪份既有文案，文案本体归调用时钟。 */
  missingKind: InterpretMissingKind;
  /** 展示缺失：事件 = 无行，模板 = 无条目，存在性引用 = 不存在。 */
  missing: boolean;
  /** 事件 ok 且落后即真；模板与存在性引用恒 false（版本钉住 / 无版本维度）。 */
  outdated: boolean;
};

/**
 * 时钟→拦截门：runtime 问拒绝启动，edit 问各形态的保存门，guard 问删除
 * 守卫，view 不拦截（只标记）。各形态只认领自己有的列：事件步骤按 id
 * 匹配守卫（version-missing 行在仍拦删），内置模板不可删除恒放行；
 * 存在性引用不查表（两态语义在 interpretPresence 单点直译）。
 */
function blocksFor(
  status: RefStatusName,
  clock: InterpretClock,
  gates: {
    edit: (edit: RefConsequence["edit"]) => boolean;
    guard: (guard: RefConsequence["guard"]) => boolean;
  },
): boolean {
  const consequence = REF_CONSEQUENCES[status];
  if (clock === "runtime") return consequence.runtime.blocks;
  if (clock === "edit") return gates.edit(consequence.edit);
  if (clock === "guard") return gates.guard(consequence.guard);
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
  const latest = row ? latestVersionOf(row) : undefined;
  const latestRevision = latest?.revision ?? 0;
  return {
    status: status.status,
    row,
    entry,
    blocks: blocksFor(status.status, clock, {
      edit: (edit) => edit.eventBlocksSave,
      guard: (guard) => guard.eventBlocksDelete,
    }),
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
 * 取必在的行（缺失分支已在调用侧处理 后调用）：行缺失即 interpreter
 * 不变式破坏（表断言 hasRow 与 kernel 一致，测试钉住），按编程错误
 * 直接终止——不保留「沿用缺失文案」的伪防御分支（对齐 Rust 侧
 * narrow! 的 unreachable 口径）。
 */
export function expectRow<Row, Entry>(step: InterpretedStep<Row, Entry>): Row {
  if (step.row === undefined) {
    throw new Error("interpreter 不变式破坏：缺失分支已处理而行仍缺");
  }
  return step.row;
}

/**
 * 取必在的条目（同 expectRow 口径：版本缺失分支已在调用侧处理）。
 */
export function expectEntry<Row, Entry>(
  step: InterpretedStep<Row, Entry>,
): Entry {
  if (step.entry === undefined) {
    throw new Error("interpreter 不变式破坏：缺失分支已处理而条目仍缺");
  }
  return step.entry;
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
    blocks: blocksFor(status.status, clock, {
      edit: (edit) => edit.templateBlocksSave,
      // 内置模板不可删除，guard 无对应列、恒放行。
      guard: () => false,
    }),
    missingKind: consequence.runtime.missingKind,
    missing: entry === undefined,
    outdated: false,
  };
}

/**
 * 存在性引用解释的可辨识联合：命中分支（blocked: false）带回主语本体，
 * 调用侧直接取 row 使用，不再写 `|| !subject` 补类型收窄；否定分支只有
 * blocked，文案本体归调用时钟。
 */
export type PresenceVerdict<Subject> =
  | { blocked: true }
  | { blocked: false; row: Subject };

/**
 * 存在性引用解释：lane 剧本（快照优先解析命中与否）/ 编辑时钟窄行（只有
 * id 维度）/ 删除守卫计数（引用名列表非空与否）+ 时钟 → 唯一词汇。主语传
 * 引用本体（undefined 即不存在，存在性由本入口内部判定，调用侧不再自行
 * 换算布尔）或布尔谓词（删除守卫计数的既有形态：true = 有引用、false =
 * 无引用；布尔主语按谓词取义，不当本体）。只有 ok / id-missing 两态：
 * - 本体主语 + runtime / edit / view：缺失即本时钟的否定判定（拒启动 /
 *   拒保存 / 行不可用不计入），命中则放行并带回主语；
 * - 谓词主语 + guard：有引用即拦删（与存在性反向），无引用放行带回谓词值。
 * 故同步门 / 钉快照门 / 删事件与删剧本守卫共用本入口，无需再按形态分岔。
 */
export function interpretPresence<Subject>(
  subject: Subject | undefined | false,
  clock: InterpretClock,
): PresenceVerdict<Subject> {
  const present = subject !== undefined && subject !== false;
  if (clock === "guard") {
    return present
      ? { blocked: true }
      : { blocked: false, row: subject as Subject };
  }
  return present
    ? { blocked: false, row: subject as Subject }
    : { blocked: true };
}
