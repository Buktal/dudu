/**
 * 保存瞬间快照（另存竞态守卫的唯一词汇，plans / scenarios / events 三域
 * 共用）：另存 thunk 发起持久化前给当前草稿拍快照（draftSnapshot），
 * fulfilled 时经 draftUnchangedSince 比对草稿是否仍是保存瞬间的内容——
 * 不一致即保存途中又动手，调用侧放弃切换草稿（切副本会吞掉用户新输入）。
 * 语义原样收敛自三处重复的 JSON.stringify 比对；events 的 rawText 另有
 * 独立比对，不属本词汇。
 */

/** 拍保存瞬间快照：草稿的稳定序列化（null 序列化为 "null"）。 */
export function draftSnapshot(draft: unknown): string {
  return JSON.stringify(draft) ?? "null";
}

/** 草稿自快照以来是否未被改动（保存途中又动手即 false）。 */
export function draftUnchangedSince(
  current: unknown,
  snapshot: string,
): boolean {
  return JSON.stringify(current) === snapshot;
}
