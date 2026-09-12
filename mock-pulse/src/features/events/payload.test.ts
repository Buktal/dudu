import { describe, expect, it } from "vitest";

import {
  appendVersion,
  createDraft,
  draftFromItem,
  type EventItem,
} from "./model";
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
  wireBodyText,
  wirePayload,
} from "./payload";
import { schemaById } from "./schemas";

const dyText = schemaById("dy-text");
const dyImage = schemaById("dy-image");
const dyEnter = schemaById("dy-enter");
const dyRead = schemaById("dy-read");

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

// ---- wireBodyText：直发明文的确定性拼装 ----
// 期望值独立转写自 docs/research/channels/douyin.md §5.5/§5.7/§5.10/§5.11/§5.13，
// 是模板转写与序列化管线的独立真值（原文缺逗号/尾逗号已按 JSON 语法修复，键序不变）。

describe("wireBodyText 黄金样本（官方逐字）", () => {
  it("IM 文本消息（§5.10 含 user_infos）", () => {
    const expected = {
      event: "im_receive_msg",
      client_key: "asdfavetgbvasf",
      from_user_id: "aaa-ae9b-4dbf-add1-bf67e4093fab",
      to_user_id: "aaa-7ae0-4399-914a-5eb1df5861ba",
      content: {
        conversation_short_id:
          "@9Vxc1/yDU8sqaS+gN4koEc7912foPPiLPZVyrQmgKVQabPH460zdRmYqig357zEBMaXjKvvhvwY02ISB7llsWQ==",
        server_message_id:
          "@9Vxc1/yDU8sqaS+gN4koEc7912foPPyAPpF2rgykLFgbafb560zdRmYqig357zEBmWXVPshhwyd/y/7BQpXy/w==",
        conversation_type: 1,
        create_time: 1681303285997,
        message_type: "text",
        source: "",
        text: "捷途70",
        index: "1672502407220000",
        user_infos: [
          {
            open_id: "aaa-ae9b-4dbf-add1-bf67e4093fab",
            nick_name: "刘东",
            avatar:
              "https://p3.douyinpic.com/aweme/720x720/xxxxx-avatar/mosaic-legacy_3795_3047680722.jpeg?from=3782654143",
          },
          {
            open_id: "aaa-7ae0-4399-914a-5eb1df5861ba",
            nick_name: "毕节--捷途万丰店",
            avatar:
              "https://p3.douyinpic.com/aweme/720x720/xxxxxx-avatar/tos-cn-avt-0015_6c9ae9afb4e62e2263f98809e3dc5b6a.jpeg?from=3782654143",
          },
        ],
      },
    };
    expect(wireBodyText(dyText, dyText.payload)).toBe(JSON.stringify(expected));
  });

  it("IM 图片消息（§5.7）", () => {
    const expected = {
      event: "im_receive_msg",
      client_key: "asdfavetgbvasf",
      from_user_id: "ac6479a5-d7a6-4018-84be-c29bfc00000",
      to_user_id: "8067f050-f8cf-4fa3-9357-c29bfc00000",
      content: {
        conversation_short_id:
          "@c29bfc000+MNggFhRkwGuX1ntuc0QfA0VnmRejrzWUBwDdDYrU9MpJSYEVV6/2hKU0il5iay8J99+0t5j3zrbA==",
        server_message_id:
          "@c29bfc000+MNggFhRkwGuX1ntuc0RPc0VHKefj/yWEJ8DtjUrU9MpJSYEVV6/2hKrOcqY1gIxctCXW23v4oW/Q==",
        conversation_type: 1,
        create_time: 1656571939562,
        message_type: "image",
        index: "1672502407220000",
      },
    };
    expect(wireBodyText(dyImage, dyImage.payload)).toBe(
      JSON.stringify(expected),
    );
  });

  it("进入私信会话（§5.11，content 为官方逐字 JSON 字符串，紧凑无空格）", () => {
    // §5.11 content 原文（一行，逐字）：
    const officialContent =
      '{"conversation_short_id":"@9Vxc1/yDU8sqaS+gN4koEc7912foPPyAOJNyrA+nLFAba/f760zdRmYqig357zEBFWIIcsZD6/UJHKbF2JNw4w==","server_message_id":"@9Vxc1/yDU8sqaS+gN4koEc7912foPPyAPZd5qgKuL1UVbfj460zdRmYqig357zEBi2hwzcxjeRsR2HorFuOHvA==","conversation_type":1,"create_time":1681303286088,"scene_type":4,"user_infos":[{"open_id":"xxxx8a0b-4c0f-b04f-feba0e909113","nick_name":"Hs姝羽","avatar":"https://p6.douyinpic.com/aweme/720x720/xxxx/tos-cn-i-0813_f2c60a21b05d43e68dd6daffd7d5d733.jpeg?from=3782654143"},{"open_id":"xxxx-81ec-424c-b738-8693eeaf53ea","nick_name":"广汽传祺张掖华逸店","avatar":"https://p6.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813_5d0c96b34bcc4068bb6f9f43b604448a.jpeg?from=3782654143"}],"data-im-extra":"123456789","query":"cptName=button","path":"page/componentTpl/componentTpl"}';
    const out = wireBodyText(dyEnter, dyEnter.payload);
    // 紧凑序列化：无空格
    expect(out).not.toMatch(/[:,]\s/);
    // 信封键序 + content 逐字
    expect(out).toBe(
      `{"event":"im_enter_direct_msg","client_key":"aaaoqobz68a71u1","from_user_id":"aaa-8a0b-4c0f-b04f-feba0e909113","to_user_id":"aaa-81ec-424c-b738-8693eeaf53ea","content":${JSON.stringify(officialContent)}}`,
    );
  });

  it("私信已读（§5.13，index 在 conversation_type 之前的官方键序）", () => {
    const expected = {
      event: "im_message_read",
      client_key: "ttddf8ab4542c7d76601",
      from_user_id: "_000f9pF8lTroNtA9pfLjPohf1qIUzLdiWRs",
      to_user_id: "_000bfeGRgbkwDMMksxyg4auRqXAPGIZk1pl",
      content: {
        conversation_short_id:
          "@4F8A0vXKXctkaiPzY485F6f81WSGOvmFOJB3rwivKFMQaPT00HDnemIujgn96zUFraoX3c4RU8SOd4uRCKWmdg==",
        index: "1672502407220000",
        conversation_type: 1,
        read_open_id: "_000bfeGRgbkwDMMksxyg4auRqXAPGIZk1pl",
      },
    };
    expect(wireBodyText(dyRead, dyRead.payload)).toBe(JSON.stringify(expected));
  });
});

describe("wireBodyText 确定性", () => {
  it("同一草稿两次拼装逐字节一致（含中文与非 ASCII）", () => {
    const draft = createDraft("新客问价", dyText);
    const first = wireBodyText(dyText, draft.payload);
    const second = wireBodyText(dyText, draft.payload);
    expect(first).toBe(second);
    expect(first).toContain("捷途70");
  });

  it("编辑→保存→重载→再拼装逐字节一致（文档序经持久化往返保序）", () => {
    const draft = createDraft("进入会话", dyEnter);
    const before = wireBodyText(dyEnter, draft.payload);

    // 保存 = wirePayload 对象序列化进 events.json；重载 = JSON 往返（文档序保序）
    const item: EventItem = appendVersion(
      null,
      draft,
      "2026-09-12T01:00:00.000Z",
    );
    const persisted = JSON.parse(
      JSON.stringify(item.versions[0].payload),
    ) as Record<string, unknown>;
    const reloadedItem: EventItem = {
      ...item,
      versions: item.versions.map((version) => ({
        ...version,
        payload: persisted,
      })),
    };
    const reloaded = draftFromItem(reloadedItem);
    expect(wireBodyText(dyEnter, reloaded.payload)).toBe(before);
  });

  it("未知字段按文档位置保留在尾部，不重排已有键序", () => {
    const draft = createDraft("新客问价", dyText);
    const edited = setPayloadField(
      setPayloadField(draft.payload, "content.guest_id", "g-001"),
      "extra_top",
      { keep: true },
    );
    const out = wireBodyText(dyText, edited);
    const topKeys = Object.keys(JSON.parse(out) as Record<string, unknown>);
    expect(topKeys).toEqual([
      "event",
      "client_key",
      "from_user_id",
      "to_user_id",
      "content",
      "extra_top",
    ]);
    const content = (JSON.parse(out) as Record<string, unknown>)
      .content as Record<string, unknown>;
    const contentKeys = Object.keys(content);
    expect(contentKeys[contentKeys.length - 1]).toBe("guest_id");
  });
});
