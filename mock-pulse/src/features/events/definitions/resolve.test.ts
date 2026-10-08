import { describe, expect, it } from "vitest";
import { flattenPayload } from "../payload-value";
import { schemaById } from "../schemas";
import {
  finalizeField,
  inferFieldType,
  resolveEditorFields,
  resolveFields,
  UNKNOWN_FIELD_DESCRIPTION,
  UNKNOWN_FIELD_GROUP,
} from "./resolve";

const dyText = schemaById("dy-text");
const dyEnter = schemaById("dy-enter");

describe("resolveFields：基线 + 用户覆写 + 未知回退", () => {
  it("无用户定义时按基线声明序展示官方说明与当前值", () => {
    const fields = resolveFields(
      dyText,
      undefined,
      flattenPayload(dyText.payload),
    );
    // 描述符字段在前（声明序）；黄金样本里第二份 user_infos 无描述符，落入未知组殿后
    expect(
      fields.slice(0, dyText.fields.length).map((field) => field.path),
    ).toEqual(dyText.fields.map((field) => field.path));
    expect(
      fields.slice(dyText.fields.length).map((field) => field.path),
    ).toEqual([
      "content.user_infos[1].avatar",
      "content.user_infos[1].nick_name",
      "content.user_infos[1].open_id",
    ]);
    const sender = fields[0];
    expect(sender).toMatchObject({
      title: "发送用户 ID",
      group: "用户与身份",
      required: true,
      unknown: false,
      value: "aaa-ae9b-4dbf-add1-bf67e4093fab",
    });
  });

  it("未知叶子回退：末段做标题、分组「其他参数」、类型按值推导、排序沉底", () => {
    const payload = {
      event: "im_receive_msg",
      extra_top: { nested: [1, "two", null] },
      content: { text: "hi", guest_id: "g-001" },
    };
    const fields = resolveFields(dyText, undefined, flattenPayload(payload));
    const unknowns = fields.filter((field) => field.unknown);
    expect(unknowns.map((field) => field.path)).toEqual([
      "content.guest_id",
      "extra_top.nested[0]",
      "extra_top.nested[1]",
      "extra_top.nested[2]",
    ]);
    for (const field of unknowns) {
      expect(field.group).toBe(UNKNOWN_FIELD_GROUP);
      expect(field.group).toBe("其他参数");
      expect(field.description).toBe(UNKNOWN_FIELD_DESCRIPTION);
    }
    expect(unknowns[0]).toMatchObject({ title: "guest_id", type: "string" });
    expect(unknowns[1]).toMatchObject({ title: "0", type: "number" });
    expect(unknowns[3]).toMatchObject({ type: "json" });
    // 已知字段在前、未知按路径序殿后
    expect(fields.slice(0, dyText.fields.length).every((f) => !f.unknown)).toBe(
      true,
    );
    // 输入叶子数组未被修改
    const leaves = flattenPayload(payload);
    resolveFields(dyText, undefined, leaves);
    expect(leaves[0].path).toBe("event");
  });

  it("用户定义按 path 覆写 title/description/group/required，type/format/multiline 保持基线", () => {
    const userFields = [
      {
        path: "content.text",
        title: "客人原话",
        type: "json" as const, // 非法覆写意图：类型不可被覆写，仍取基线 string
        group: "客人输入",
        description: "用户自己写的说明。",
        multiline: false,
      },
      {
        path: "from_user_id",
        title: "发送者",
        type: "string" as const,
        group: "身份",
        description: "改写后的身份说明。",
        // 用户定义未勾必填：required 显式取 false，不被基线 true 回滚
      },
    ];
    const fields = resolveFields(
      dyText,
      userFields,
      flattenPayload(dyText.payload),
    );
    const text = fields.find((field) => field.path === "content.text");
    expect(text).toMatchObject({
      title: "客人原话",
      group: "客人输入",
      description: "用户自己写的说明。",
      type: "string", // 基线类型不随用户定义漂移
      multiline: true,
      unknown: false,
    });
    const sender = fields.find((field) => field.path === "from_user_id");
    expect(sender).toMatchObject({
      title: "发送者",
      group: "身份",
      description: "改写后的身份说明。",
    });
    // 用户未勾必填：基线的 required 被显式取消
    expect(sender?.required).toBeUndefined();
    // 覆写不改基线声明序
    expect(fields.map((field) => field.path)[0]).toBe("from_user_id");
  });

  it("未知字段补录说明后转正：不再是 unknown、按其分组归位、显示自定义标题", () => {
    // 黄金样本第二份 user_infos 是未知字段，为其补录说明
    const userFields = [
      {
        path: "content.user_infos[1].nick_name",
        title: "客服昵称",
        type: "string" as const,
        group: "客服资料",
        description: "接待客服的展示名。",
      },
    ];
    const fields = resolveFields(
      dyText,
      userFields,
      flattenPayload(dyText.payload),
    );
    const promoted = fields.find(
      (field) => field.path === "content.user_infos[1].nick_name",
    );
    expect(promoted).toMatchObject({
      title: "客服昵称",
      group: "客服资料",
      description: "接待客服的展示名。",
      unknown: false,
      value: "毕节--捷途万丰店",
    });
    // 不在补录列表里的未知字段仍沉底为未知
    expect(
      fields.find((field) => field.path === "content.user_infos[1].avatar")
        ?.unknown,
    ).toBe(true);
    // 转正字段跟基线一起参与分组（不再落入「其他参数」）
    expect(
      fields.filter((field) => field.group === "客服资料").map((f) => f.path),
    ).toEqual(["content.user_infos[1].nick_name"]);
  });

  it("contentString 模板按解析后的 content 解析字段（便捷入口）", () => {
    const fields = resolveEditorFields(dyEnter, undefined, dyEnter.payload);
    const scene = fields.find((field) => field.path === "content.scene_type");
    expect(scene?.value).toBe(4);
    // 黄金样本里的 data-im-extra / query / path 是描述符未覆盖的官方字段
    const unknownPaths = fields
      .filter((field) => field.unknown)
      .map((field) => field.path);
    expect(unknownPaths).toEqual(
      expect.arrayContaining([
        "content.data-im-extra",
        "content.query",
        "content.path",
      ]),
    );
  });

  it("描述符存在但载荷缺失的字段以空值占位（编辑时写入）", () => {
    const fields = resolveEditorFields(dyText, undefined, {
      event: "im_receive_msg",
      content: { text: "hi" },
    });
    const logId = fields.find((field) => field.path === "log_id");
    expect(logId).toMatchObject({ unknown: false, value: undefined });
    const text = fields.find((field) => field.path === "content.text");
    expect(text?.value).toBe("hi");
  });
});

describe("表单元数据辅助", () => {
  it("inferFieldType：原始值直映射，对象/数组/null 按 json", () => {
    expect(inferFieldType("文本")).toBe("string");
    expect(inferFieldType(3)).toBe("number");
    expect(inferFieldType(true)).toBe("boolean");
    expect(inferFieldType(null)).toBe("json");
    expect(inferFieldType([1])).toBe("json");
    expect(inferFieldType({ a: 1 })).toBe("json");
  });

  it("finalizeField：空标题回退 path、空分组回退「其他参数」、空含义回退缺省文案，布尔旗标按需落键", () => {
    expect(
      finalizeField({
        path: "content.guest_id",
        title: "  ",
        type: "string",
        group: "",
        description: "",
        required: false,
        multiline: false,
      }),
    ).toEqual({
      path: "content.guest_id",
      title: "content.guest_id",
      type: "string",
      group: "其他参数",
      description: UNKNOWN_FIELD_DESCRIPTION,
    });
    expect(
      finalizeField({
        path: "a.b",
        title: "标题",
        type: "number",
        group: "组",
        description: "含义",
        required: true,
      }),
    ).toEqual({
      path: "a.b",
      title: "标题",
      type: "number",
      group: "组",
      description: "含义",
      required: true,
    });
  });
});
