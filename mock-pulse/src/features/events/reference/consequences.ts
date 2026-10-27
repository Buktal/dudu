/**
 * 引用解析 consequence 表（C5：kernel 旁的后果表）。
 *
 * 分类（ok / id-missing / version-missing）仍由 resolve kernel 产出；
 * 每个分类在四个时钟里的含义收敛到本表，各时钟只查表不再按
 * `status === "version-missing"` 自行分岔：
 * - runtime（runs 快照物化 / plans 编排物化）：是否拒绝启动；
 *   missingKind 只告诉调用方该用哪份既有文案（id 缺失 / 版本缺失），
 *   文案本体仍归各时钟，措辞一字不动。
 * - view（scenarios resolveSteps / plans planStats）：行与条目是否存在；
 *   事件行 missing = 无行（version-missing 带回行故不标 missing，
 *   行照常展示，拒绝启动是运行时钟的事），模板行 missing = 无条目
 *   （id-missing 与 version-missing 同标 missing）；outdated 仅 ok 且
 *   落后时由时钟按 latestRevision 计算，mayOutdate 标记该可能。
 * - edit（validateScenario / 同步 thunk）：事件保存只看行存在（超前
 *   revision 存得下、运行时再拦），模板保存两种缺失都拦。
 * - guard（组合根删除守卫）：存在引用即拦删；事件引用按 id 匹配，
 *   故 version-missing 仍拦删（行在）。
 *
 * 本表为 events 域内私有：唯一读方是 ./interpret，域外消费一律走
 * interpret* 的时钟入口。归位：随 kernel 与 interpreter 一并住
 * ./reference（评审 C1）；kernel 与 interpret* 经 reference/index.ts
 * 出门，供 events 门面与 model 再导出，本表不经此出口。
 */

export type RefStatusName = "ok" | "id-missing" | "version-missing";

export type RefConsequence = {
  /** 运行时钟：是否拒绝启动；missingKind 选用哪份既有文案 */
  runtime: { blocks: boolean; missingKind: "id" | "version" | null };
  /** 展示时钟：行/条目是否存在；ok 才可能标 outdated */
  view: { hasRow: boolean; hasEntry: boolean; mayOutdate: boolean };
  /** 编辑时钟：事件 / 模板两类保存门 */
  edit: { eventBlocksSave: boolean; templateBlocksSave: boolean };
  /** 删除守卫：存在引用即拦删 */
  guard: { eventBlocksDelete: boolean };
};

export const REF_CONSEQUENCES: Record<RefStatusName, RefConsequence> = {
  ok: {
    runtime: { blocks: false, missingKind: null },
    view: { hasRow: true, hasEntry: true, mayOutdate: true },
    edit: { eventBlocksSave: false, templateBlocksSave: false },
    guard: { eventBlocksDelete: true },
  },
  "id-missing": {
    runtime: { blocks: true, missingKind: "id" },
    view: { hasRow: false, hasEntry: false, mayOutdate: false },
    edit: { eventBlocksSave: true, templateBlocksSave: true },
    guard: { eventBlocksDelete: false },
  },
  "version-missing": {
    runtime: { blocks: true, missingKind: "version" },
    view: { hasRow: true, hasEntry: false, mayOutdate: false },
    edit: {
      // 事件保存只校验行存在（validateScenario 无 revision 检查），
      // 超前 revision 存得下、运行时钟再拒绝；模板保存两种缺失都拦。
      eventBlocksSave: false,
      templateBlocksSave: true,
    },
    // 事件引用按 id 匹配守卫，行在即拦删。
    guard: { eventBlocksDelete: true },
  },
};

/**
 * 查表取行（有行才带回）：scenarios 展示时钟经此拿事件行，
 * 不再写 `status === "id-missing" ? undefined : row`。
 * 表断言 hasRow 与 kernel 带回行一致（consequences.test.ts 钉住）。
 */
export function refRowOf<Row>(
  status: { readonly status: RefStatusName } & Partial<{ readonly row: Row }>,
): Row | undefined {
  if (!REF_CONSEQUENCES[status.status].view.hasRow) return undefined;
  return (status as { readonly row?: Row }).row;
}

/**
 * 查表取条目（命中才带回）：展示时钟经此拿版本/模板条目，
 * 不再写 `status === "ok" ? entry : undefined`。
 */
export function refEntryOf<Entry>(
  status: { readonly status: RefStatusName } & Partial<{
    readonly entry: Entry;
  }>,
): Entry | undefined {
  if (!REF_CONSEQUENCES[status.status].view.hasEntry) return undefined;
  return (status as { readonly entry?: Entry }).entry;
}
