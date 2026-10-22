import { uniq } from "lodash-es";

/** 标签分隔符：编辑文本按逗号/分号/换行分隔；单条标签含任一分隔符即非法。 */
export const TAG_SEPARATORS = /[,，;；\r\n]+/;

/**
 * 契约第 2 节标签口径：编辑文本按分隔符切分，去首尾空白与空项、去重保序，
 * 编辑组件与保存出口共用同一解析。
 */
export function parseTags(value: string): string[] {
  return uniq(
    value
      .split(TAG_SEPARATORS)
      .map((tag) => tag.trim())
      .filter(Boolean),
  );
}
