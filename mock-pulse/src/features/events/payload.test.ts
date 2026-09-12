import { describe, expect, it } from "vitest";

import {
  editorPayload,
  flattenPayload,
  getAt,
  parseWirePayload,
  resolveEditorFields,
  safePath,
  setAt,
  setPayloadField,
  syncSenderIdentity,
  wirePayload,
} from "./payload";
import { schemaById } from "./schemas";

const dyText = schemaById("dy-text");
const dyEnter = schemaById("dy-enter");

describe("路径工具", () => {
  it("flattenPayload 展开嵌套对象与数组，路径含下标", () => {
    const leaves = flattenPayload({
      event: "im_receive_msg",
      content: {
        text: "你好",
        user_infos: [{ nick_name: "刘东" }, { nick_name: "毕节" }],
        empty_group: {},
      },
    });
    const paths = leaves.map((leaf) => leaf.path);
    expect(paths).toContain("event");
    expect(paths).toContain("content.text");
    expect(paths).toContain("content.user_infos[0].nick_name");
    expect(paths).toContain("content.user_infos[1].nick_name");
    // 空容器视为 json 叶子（原样可见，值本身保留在载荷中）
    const emptyGroup = leaves.find(
      (leaf) => leaf.path === "content.empty_group",
    );
    expect(emptyGroup?.value).toEqual({});
  });

  it("setAt 创建中间层并写入，getAt 按路径读取", () => {
    const obj: Record<string, unknown> = {};
    setAt(obj, "content.user_infos[1].open_id", "x");
    const userInfos = (obj.content as Record<string, unknown>)
      .user_infos as unknown[];
    expect(Array.isArray(userInfos)).toBe(true);
    expect(getAt(obj, "content.user_infos[1].open_id")).toBe("x");
    expect(getAt(obj, "content.missing")).toBeUndefined();
  });

  it("保留字段名路径被拒绝", () => {
    expect(safePath("content.__proto__.x")).toBe(false);
    expect(safePath("content.constructor")).toBe(false);
    expect(safePath("content.text")).toBe(true);
    expect(() => setAt({}, "__proto__.polluted", 1)).toThrow("保留名称");
  });
});

describe("表单/线上载荷转换", () => {
  it("contentString 模板：editorPayload 解析 content，wirePayload 序列化回去", () => {
    const wire = structuredClone(dyEnter.payload);
    const editor = editorPayload(dyEnter, wire);
    expect(typeof editor.content).toBe("object");
    expect((editor.content as Record<string, unknown>).scene_type).toBe(4);

    const back = wirePayload(dyEnter, editor);
    expect(typeof back.content).toBe("string");
    expect(back.content).toBe(dyEnter.payload.content);
  });

  it("往返保留未知字段与键序", () => {
    const wire = wirePayload(
      dyEnter,
      setPayloadField(
        editorPayload(dyEnter, structuredClone(dyEnter.payload)),
        "content.custom_field",
        "保留我",
      ),
    );
    const content = JSON.parse(wire.content as string) as Record<
      string,
      unknown
    >;
    expect(content.custom_field).toBe("保留我");
    expect(Object.keys(content).pop()).toBe("custom_field");
  });

  it("parseWirePayload 校验 JSON 形态", () => {
    expect(parseWirePayload('{"a":1}')).toEqual({ a: 1 });
    expect(() => parseWirePayload("{oops")).toThrow("合法的 JSON");
    expect(() => parseWirePayload("[1,2]")).toThrow("对象");
    expect(() => parseWirePayload('{"__proto__":{"x":1}}')).toThrow(
      "保留字段名",
    );
  });
});

describe("resolveEditorFields", () => {
  it("已知字段按描述符顺序展示官方说明与当前值", () => {
    const fields = resolveEditorFields(dyText, dyText.payload);
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
    const text = fields.find((field) => field.path === "content.text");
    expect(text).toMatchObject({ multiline: true, value: "捷途70" });
  });

  it("载荷中的未知字段进入「待补充说明」分组并原样保留", () => {
    const payload = structuredClone(dyText.payload) as Record<string, unknown>;
    (payload.content as Record<string, unknown>).guest_id = "g-001";
    (payload as Record<string, unknown>).extra_top = { nested: [1, 2] };

    const fields = resolveEditorFields(dyText, payload);
    const unknowns = fields.filter((field) => field.unknown);
    expect(unknowns.map((field) => field.path)).toEqual([
      "content.guest_id",
      "content.user_infos[1].avatar",
      "content.user_infos[1].nick_name",
      "content.user_infos[1].open_id",
      "extra_top.nested[0]",
      "extra_top.nested[1]",
    ]);
    for (const field of unknowns) {
      expect(field.group).toBe("待补充说明");
      expect(field.description).toContain("原样保留");
    }
    // 载荷本身未被修改
    expect((payload.content as Record<string, unknown>).guest_id).toBe("g-001");
  });

  it("描述符存在但载荷缺失的字段以空值占位（编辑时写入）", () => {
    const fields = resolveEditorFields(dyText, {
      event: "im_receive_msg",
      content: { text: "hi" },
    });
    const logId = fields.find((field) => field.path === "log_id");
    expect(logId).toMatchObject({ unknown: false, value: undefined });
    const text = fields.find((field) => field.path === "content.text");
    expect(text?.value).toBe("hi");
  });

  it("contentString 模板按解析后的 content 解析字段", () => {
    const fields = resolveEditorFields(dyEnter, dyEnter.payload);
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
});

describe("syncSenderIdentity", () => {
  it("把资料 open_id 对齐到 from_user_id，返回新对象", () => {
    const payload = editorPayload(dyText, dyText.payload);
    (payload.content as Record<string, unknown>).user_infos = [
      {
        open_id: "someone-else",
        nick_name: "刘东",
        avatar: "https://example.invalid/a.png",
      },
    ];
    const synced = syncSenderIdentity(dyText, payload);
    const userInfos = (synced.content as Record<string, unknown>)
      .user_infos as Array<Record<string, unknown>>;
    expect(userInfos[0].open_id).toBe(synced.from_user_id);
    expect(payload).not.toBe(synced);
  });

  it("contentString 模板同步后 content 仍是解析对象（不破坏结构）", () => {
    const payload = editorPayload(dyEnter, dyEnter.payload);
    const synced = syncSenderIdentity(dyText, payload);
    expect(typeof synced.content).toBe("object");
    const userInfos = (synced.content as Record<string, unknown>)
      .user_infos as Array<Record<string, unknown>>;
    expect(userInfos[0].open_id).toBe(synced.from_user_id);
  });

  it("无资料路径的模板（dy-read）原样返回", () => {
    const payload = structuredClone(schemaById("dy-read").payload);
    expect(syncSenderIdentity(schemaById("dy-read"), payload)).toBe(payload);
  });
});
