import { isEqual } from "lodash-es";

/**
 * 草稿脏判定的单一算法（events / scenarios / plans / connections 四域装配，
 * 消费点见各 select*Dirty）：「touched 门 + 与基线的内容差」。
 * 派生比较只能判内容差，判不了「人动手没」——未保存过的新草稿内容恒与
 * 空存量不同，无门则新建零编辑即恒脏，切视图误弹「放弃更改」（DraftGuard
 * 误拦）；只看门则改回原值误报。两者合成：没动手恒不脏；动手了才与基线
 * 比内容，无基线（未保存过的新草稿）动手即脏。
 * touched 位归域状态（编辑 reducer 置位，装载 / 放弃 / 保存回包清位；
 * connections 不设独立位——草稿只在编辑时产生，有草稿即动过手）。
 */

/** 脏判定入参：touched 门 + 草稿 / 基线的内容差 */
export function draftDirty<TDraft, TBaseline>(input: {
  /** 用户动过手（域状态 touched 位） */
  touched: boolean;
  /** 当前草稿；null = 无草稿，恒不脏 */
  draft: TDraft | null;
  /** 库内基线；null = 未保存过的新草稿，动手即脏 */
  baseline: TBaseline | null;
  /** 内容差判定；缺省 = 整对象深比较（同形草稿/基线），字段规范形差异的域传入 */
  differs?: (draft: TDraft, baseline: TBaseline) => boolean;
}): boolean {
  if (!input.touched || input.draft === null) return false;
  if (input.baseline === null) return true;
  const differs =
    input.differs ??
    ((draft: TDraft, baseline: TBaseline) => !isEqual(draft, baseline));
  return differs(input.draft, input.baseline);
}
