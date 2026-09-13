import { keyParts } from "../paths";
import { editorPayload, flattenPayload, type PayloadLeaf } from "../payload";
import type {
  EventSchema,
  FieldDescriptor,
  FieldType,
  WirePayload,
} from "../schemas";
import { schemaDefinition } from "./loader";

/**
 * 字段说明解析/合并（#22，纯数据进出，不碰 React/store）：
 * 渠道描述文件基线 + 用户定义覆写 + 未知叶子回退 → 表单字段。
 * - 覆写按 path 合并：title/description/group/required 随用户定义，
 *   type/format/multiline 恒取基线（类型由协议定，不随说明漂移）；
 * - 用户补录的新路径（如转正的未知字段）按用户定义序跟在基线后；
 * - 载荷里既无基线也无用户定义的叶子按未知回退，排序沉底。
 * 字典「应用说明」= 把弹窗内生效的全部字段写成该 schemaId 的用户定义，
 * 未知字段由此转正：不再是 unknown、按其分组归位、显示自定义标题。
 */

/** 未知字段的缺省说明（补录入口引导语） */
export const UNKNOWN_FIELD_DESCRIPTION =
  "还没有字段说明。补充说明后，同类型事件都会显示。";

/** 未知字段的缺省分组 */
export const UNKNOWN_FIELD_GROUP = "其他参数";

/** 表单字段 = 生效描述符 + 载荷当前值 + 未知标注 */
export type EditorField = FieldDescriptor & {
  /** 描述符未定义的未知字段：原样保留，表单标注待补充说明 */
  unknown: boolean;
  /** 载荷里尚未设置的描述符字段：编辑后写入 */
  value: unknown;
};

/** 类型按值推导：字符串/数字/布尔直接映射，其余（对象/数组/null）按 json */
export function inferFieldType(value: unknown): FieldType {
  const typeOf = typeof value;
  if (typeOf === "string" || typeOf === "number" || typeOf === "boolean") {
    return typeOf;
  }
  return "json";
}

/**
 * 生效描述符 = 渠道描述文件基线 + 用户定义覆写/补录。
 * 用户定义命中基线路径 → 整条说明（标题/含义/分组/必填）随用户；
 * 未命中 → 作为补录的新描述符追加。
 */
export function effectiveDescriptors(
  schemaId: string,
  userFields: readonly FieldDescriptor[] | undefined,
): FieldDescriptor[] {
  const userByPath = new Map(
    (userFields ?? []).map((field) => [field.path, field]),
  );
  const merged: FieldDescriptor[] = [];
  for (const base of schemaDefinition(schemaId).fields) {
    const user = userByPath.get(base.path);
    if (!user) {
      merged.push(base);
      continue;
    }
    userByPath.delete(base.path);
    // 命中即整条说明随用户；type/format/multiline 恒取基线，
    // required 显式随用户勾选（勾了才落键，可取消基线必填）
    merged.push({
      path: base.path,
      title: user.title,
      type: base.type,
      group: user.group,
      description: user.description,
      ...(base.format ? { format: base.format } : {}),
      ...(base.multiline ? { multiline: true } : {}),
      ...(user.required === true ? { required: true } : {}),
    });
  }
  for (const added of userByPath.values()) {
    merged.push({ ...added });
  }
  return merged;
}

/**
 * 表单字段解析：生效描述符在前（声明序），未知叶子按路径序殿后。
 * 入参 leaves 通常来自 flattenPayload(editorPayload(schema, payload))。
 */
export function resolveFields(
  schemaId: string,
  userFields: readonly FieldDescriptor[] | undefined,
  leaves: readonly PayloadLeaf[],
): EditorField[] {
  const leafByPath = new Map(leaves.map((leaf) => [leaf.path, leaf]));
  const fields: EditorField[] = [];
  for (const descriptor of effectiveDescriptors(schemaId, userFields)) {
    fields.push({
      ...descriptor,
      value: leafByPath.get(descriptor.path)?.value,
      unknown: false,
    });
    leafByPath.delete(descriptor.path);
  }
  const extras = [...leafByPath.values()].sort((a, b) =>
    a.path.localeCompare(b.path),
  );
  for (const leaf of extras) {
    const parts = keyParts(leaf.path);
    fields.push({
      path: leaf.path,
      title: parts[parts.length - 1] || leaf.path,
      type: inferFieldType(leaf.value),
      group: UNKNOWN_FIELD_GROUP,
      description: UNKNOWN_FIELD_DESCRIPTION,
      unknown: true,
      value: leaf.value,
    });
  }
  return fields;
}

/** 表单便捷入口：事件 schema + 表单形态载荷（contentString 已解析）→ 字段。 */
export function resolveEditorFields(
  schema: EventSchema,
  userFields: readonly FieldDescriptor[] | undefined,
  payload: WirePayload,
): EditorField[] {
  return resolveFields(
    schema.id,
    userFields,
    flattenPayload(editorPayload(schema, payload)),
  );
}

/**
 * 编辑收口：字典弹窗/导入的字段在「应用说明」与「导出」前统一归一——
 * 空标题回退 path、空分组回退「其他参数」、空含义回退缺省引导语，
 * 布尔旗标仅在为真时落键，保持 FieldDescriptor 形状干净。
 */
export function finalizeField(field: FieldDescriptor): FieldDescriptor {
  const finalized: FieldDescriptor = {
    path: field.path,
    title: field.title.trim() || field.path,
    type: field.type,
    group: field.group.trim() || UNKNOWN_FIELD_GROUP,
    description: field.description.trim() || UNKNOWN_FIELD_DESCRIPTION,
  };
  if (field.required === true) {
    finalized.required = true;
  }
  if (field.format) {
    finalized.format = field.format;
  }
  if (field.multiline === true) {
    finalized.multiline = true;
  }
  return finalized;
}
