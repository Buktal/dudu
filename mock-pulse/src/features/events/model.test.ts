import { describe, expect, it } from "vitest";

import {
  appendVersion,
  createDraft,
  DEFAULT_EXPECTED,
  draftFromItem,
  duplicateDraft,
  type EventItem,
  type ExpectedReceipt,
  isDraftDirty,
  latestVersion,
  newEventId,
  resolveEventVersion,
} from "./model";
import { editorPayload, setPayloadField } from "./payload";
import { schemaById } from "./schemas";

const dyText = schemaById("dy-text");
const dyEnter = schemaById("dy-enter");
const SAVED_AT = "2026-09-12T01:00:00.000Z";

describe("appendVersion", () => {
  it("首次保存生成 v1：线上形态载荷 + 默认期望回执", () => {
    const draft = createDraft("新客问价", dyText);
    const event = appendVersion(null, draft, SAVED_AT);
    expect(event).toMatchObject({
      id: draft.id,
      name: "新客问价",
      channelId: "douyin",
      schemaId: "dy-text",
    });
    expect(event.versions).toHaveLength(1);
    expect(event.versions[0]).toMatchObject({
      revision: 1,
      savedAt: SAVED_AT,
      expected: { status: 200, body: "", bodyMode: "contains" },
    });
    expect(event.versions[0].payload.text ?? true).toBe(true);
  });

  it("再次保存追加 v2，旧版本内容不变（不可变追加）", () => {
    const draft = createDraft("新客问价", dyText);
    const v1 = appendVersion(null, draft, SAVED_AT);
    const v1Snapshot = structuredClone(v1.versions[0]);

    const edited = {
      ...draft,
      payload: setPayloadField(draft.payload, "content.text", "改成第二句"),
    };
    const v2 = appendVersion(v1, edited, "2026-09-12T02:00:00.000Z");

    expect(v2.versions).toHaveLength(2);
    expect(v2.versions[0]).toEqual(v1Snapshot);
    expect(v2.versions[0]).toEqual(v1.versions[0]);
    expect(latestVersion(v2)?.revision).toBe(2);
    const latest = latestVersion(v2);
    expect(latest).toBeDefined();
    expect(
      ((latest?.payload.content ?? {}) as Record<string, unknown>).text,
    ).toBe("改成第二句");
  });

  it("期望回执随草稿流转：装载继承上一版本，编辑后写入新版本", () => {
    const draft = createDraft("进入会话", dyEnter);
    const base = appendVersion(null, draft, SAVED_AT);
    const expected403: ExpectedReceipt = {
      status: 403,
      body: "denied",
      bodyMode: "equals",
    };
    const withExpected = {
      ...base,
      versions: base.versions.map((version) => ({
        ...version,
        expected: expected403,
      })),
    };

    // 装载草稿继承最新版本的期望
    const loaded = draftFromItem(withExpected);
    expect(loaded.expected).toEqual(expected403);

    // 未改动时期望原样进入新版本
    const untouched = appendVersion(
      withExpected,
      loaded,
      "2026-09-12T02:00:00.000Z",
    );
    expect(latestVersion(untouched)?.expected).toEqual(expected403);

    // 编辑草稿期望后，新版本记录编辑值（旧版本不变）
    const edited = {
      ...loaded,
      expected: { status: 204, body: "", bodyMode: "contains" } as const,
    };
    const next = appendVersion(
      withExpected,
      edited,
      "2026-09-12T03:00:00.000Z",
    );
    expect(latestVersion(next)?.expected).toEqual({
      status: 204,
      body: "",
      bodyMode: "contains",
    });
    expect(next.versions[0].expected).toEqual(expected403);
  });

  it("contentString 模板保存的版本 content 为线上字符串", () => {
    const draft = createDraft("进入会话", dyEnter);
    const event = appendVersion(null, draft, SAVED_AT);
    const payload = latestVersion(event)?.payload;
    expect(typeof payload?.content).toBe("string");
    expect(
      (JSON.parse(payload?.content as string) as Record<string, unknown>)
        .scene_type,
    ).toBe(4);
  });
});

describe("draftFromItem / isDraftDirty", () => {
  it("从事件最新版本装载草稿（contentString 解析为对象）", () => {
    const draft = createDraft("进入会话", dyEnter);
    const event = appendVersion(null, draft, SAVED_AT);
    const reloaded = draftFromItem(event);
    expect(reloaded.payload.content).toEqual(
      editorPayload(dyEnter, event.versions[0].payload).content,
    );
    expect(typeof reloaded.payload.content).toBe("object");
    expect(reloaded.id).toBe(event.id);
    expect(reloaded.senderSync).toBe(false);
  });

  it("脏检查：装载即干净；改字段、改名或改期望后变脏；新草稿恒脏", () => {
    const draft = createDraft("新客问价", dyText);
    const event = appendVersion(null, draft, SAVED_AT);

    const fresh = draftFromItem(event);
    expect(isDraftDirty(event, fresh)).toBe(false);

    const edited = {
      ...fresh,
      payload: setPayloadField(fresh.payload, "from_user_id", "new-id"),
    };
    expect(isDraftDirty(event, edited)).toBe(true);

    expect(isDraftDirty(event, { ...fresh, name: "改名" })).toBe(true);
    expect(
      isDraftDirty(event, {
        ...fresh,
        expected: { status: 403, body: "", bodyMode: "contains" },
      }),
    ).toBe(true);
    expect(isDraftDirty(null, fresh)).toBe(true);
  });

  it("未知字段往返：装载后原样保存，未知字段不丢失", () => {
    const draft = createDraft("新客问价", dyText);
    const withUnknown = {
      ...draft,
      payload: setPayloadField(
        setPayloadField(draft.payload, "content.guest_id", "g-9"),
        "unknown_top",
        { keep: [1, 2] },
      ),
    };
    const event = appendVersion(null, withUnknown, SAVED_AT);
    const reloaded = draftFromItem(event);
    const resaved = appendVersion(event, reloaded, "2026-09-12T02:00:00.000Z");
    const content = latestVersion(resaved)?.payload.content as Record<
      string,
      unknown
    >;
    expect(content.guest_id).toBe("g-9");
    expect(latestVersion(resaved)?.payload.unknown_top).toEqual({
      keep: [1, 2],
    });
  });
});

describe("createDraft / duplicateDraft", () => {
  it("createDraft 预填官方形态默认值，不凭空补齐模板缺失的字段", () => {
    const draft = createDraft("新客问价", dyText);
    expect(draft.name).toBe("新客问价");
    expect(draft.schemaId).toBe("dy-text");
    // 黄金样本未携带 log_id：按模板存在性生效，不注入
    expect(draft.payload.log_id).toBeUndefined();
    expect(draft.payload.from_user_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    const content = draft.payload.content as Record<string, unknown>;
    expect(String(content.create_time)).toMatch(/^\d{13}$/);
  });

  it("duplicateDraft 携带当前载荷生成新身份副本", () => {
    const draft = createDraft("新客问价", dyText);
    const copy = duplicateDraft(draft);
    expect(copy.id).not.toBe(draft.id);
    expect(new Set([draft.id, copy.id, newEventId()]).size).toBe(3);
    expect(copy.name).toBe("新客问价 · 副本");
    expect(copy.payload).toEqual(draft.payload);
    expect(copy.payload).not.toBe(draft.payload);
  });
});

describe("resolveEventVersion（步骤引用解析核心：eventId + revision 下钻）", () => {
  /** 双版本事件（载荷按版本号可辨） */
  const event: EventItem = {
    id: "evt-a",
    name: "新客问价",
    channelId: "douyin",
    schemaId: "dy-text",
    versions: [1, 2].map((revision) => ({
      revision,
      savedAt: `2026-09-12T0${revision}:00:00.000Z`,
      payload: {
        event: "im_receive_msg",
        content: { text: `v${revision}` },
      },
      expected: { ...DEFAULT_EXPECTED },
    })),
  };

  it("版本命中：返回事件本体与引用版本的载荷", () => {
    const { event: found, version } = resolveEventVersion([event], {
      eventId: "evt-a",
      revision: 1,
    });
    expect(found?.id).toBe("evt-a");
    expect(version?.revision).toBe(1);
    expect(version?.payload).toEqual(event.versions[0].payload);
  });

  it("revision 越界：事件命中、版本 undefined（缺失语义由调用时钟决定）", () => {
    const { event: found, version } = resolveEventVersion([event], {
      eventId: "evt-a",
      revision: 9,
    });
    expect(found?.id).toBe("evt-a");
    expect(version).toBeUndefined();
  });

  it("eventId 缺失：事件与版本均 undefined", () => {
    const { event: found, version } = resolveEventVersion([event], {
      eventId: "evt-gone",
      revision: 1,
    });
    expect(found).toBeUndefined();
    expect(version).toBeUndefined();
  });
});
