import { faker } from "@faker-js/faker";
import { describe, expect, it } from "vitest";

import type { ChannelId } from "@/lib/channels";
import {
  type EventFilters,
  filterEvents,
  libraryRows,
  paginateEvents,
  templatesForChannel,
} from "./library";
import type { EventItem } from "./model";
import { EVENT_SCHEMAS, schemasByChannel } from "./schemas";

/** 固定 seed 的数百条样本工厂（验收：筛选分页在数百条样本下可用） */
function seededEvents(count: number): EventItem[] {
  faker.seed(20260912);
  const schemaCycle = ["dy-text", "dy-image", "dy-enter", "dy-read"] as const;
  const items: EventItem[] = [];
  for (let i = 0; i < count; i += 1) {
    const schemaId = schemaCycle[i % schemaCycle.length];
    const channel = i % 5 === 0 ? "wecom" : "douyin";
    const name =
      i === 7
        ? "FIXEDMARK 咨询"
        : `${faker.person.lastName()} ${faker.lorem.words(2)}`;
    const base = Date.UTC(2026, 8, 12, 0, 0, 0) + i * 60_000;
    items.push({
      id: `evt-${String(i).padStart(4, "0")}`,
      name,
      channelId: channel,
      schemaId,
      versions: [
        {
          revision: 1 + (i % 3),
          savedAt: new Date(base).toISOString(),
          payload: { event: "stub" },
          expected: { status: 200, body: "", bodyMode: "contains" },
        },
      ],
    });
  }
  return items;
}

const NO_FILTERS: EventFilters = { query: "", channel: "all", kind: "all" };

describe("filterEvents", () => {
  it("数百条样本按最新保存时间倒序", () => {
    const items = seededEvents(300);
    const result = filterEvents(items, NO_FILTERS);
    expect(result).toHaveLength(300);
    for (let i = 1; i < result.length; i += 1) {
      expect(
        result[i - 1].updatedAt >= result[i].updatedAt,
        `第 ${i} 项应不早于下一项`,
      ).toBe(true);
    }
  });

  it("渠道筛选只保留对应渠道", () => {
    const items = seededEvents(300);
    const douyin = filterEvents(items, { ...NO_FILTERS, channel: "douyin" });
    expect(douyin.every((row) => row.item.channelId === "douyin")).toBe(true);
    expect(douyin.length).toBe(240);
    const wecom = filterEvents(items, { ...NO_FILTERS, channel: "wecom" });
    expect(wecom.map((row) => row.item.channelId)).toEqual(
      Array.from({ length: 60 }, () => "wecom"),
    );
  });

  it("类型筛选按 schema 的 message/event 分类", () => {
    const items = seededEvents(300);
    const messages = filterEvents(items, { ...NO_FILTERS, kind: "message" });
    const events = filterEvents(items, { ...NO_FILTERS, kind: "event" });
    expect(messages).toHaveLength(150);
    expect(events).toHaveLength(150);
    expect(messages.every((row) => row.schema?.kind === "message")).toBe(true);
    expect(events.every((row) => row.schema?.kind === "event")).toBe(true);
  });

  it("搜索命中名称/事件类型，大小写不敏感", () => {
    const items = seededEvents(300);
    const byMarker = filterEvents(items, { ...NO_FILTERS, query: "fixedmark" });
    expect(byMarker.map((row) => row.item.name)).toEqual(["FIXEDMARK 咨询"]);

    const bySchemaName = filterEvents(items, {
      ...NO_FILTERS,
      query: "接收私信",
    });
    expect(bySchemaName.length).toBeGreaterThan(0);
    expect(
      bySchemaName.every(
        (row) =>
          row.schema?.kind === "message" || row.item.channelId === "wecom",
      ),
    ).toBe(true);

    expect(
      filterEvents(items, { ...NO_FILTERS, query: "不存在的关键词" }),
    ).toEqual([]);
  });

  it("组合筛选可叠加", () => {
    const items = seededEvents(300);
    const result = filterEvents(items, {
      query: "接收私信",
      channel: "douyin",
      kind: "message",
    });
    expect(
      result.every(
        (row) =>
          row.item.channelId === "douyin" && row.schema?.kind === "message",
      ),
    ).toBe(true);
  });

  it("企微与抖音事件在同一素材库共存，渠道筛选正确分流且模板可解析", () => {
    const items: EventItem[] = [
      {
        id: "evt-dy",
        name: "抖音文本",
        channelId: "douyin",
        schemaId: "dy-text",
        versions: [
          {
            revision: 1,
            savedAt: "2026-09-12T01:00:00.000Z",
            payload: { event: "im_receive_msg" },
            expected: { status: 200, body: "", bodyMode: "contains" },
          },
        ],
      },
      {
        id: "evt-wc-text",
        name: "企微文本",
        channelId: "wecom",
        schemaId: "wc-text",
        versions: [
          {
            revision: 1,
            savedAt: "2026-09-12T02:00:00.000Z",
            payload: { MsgType: "text" },
            expected: { status: 200, body: "", bodyMode: "contains" },
          },
        ],
      },
      {
        id: "evt-wc-enter",
        name: "企微进入会话",
        channelId: "wecom",
        schemaId: "wc-enter",
        versions: [
          {
            revision: 1,
            savedAt: "2026-09-12T03:00:00.000Z",
            payload: { Event: "enter_agent" },
            expected: { status: 200, body: "", bodyMode: "contains" },
          },
        ],
      },
    ];

    const wecom = filterEvents(items, { ...NO_FILTERS, channel: "wecom" });
    expect(wecom.map((row) => row.item.id)).toEqual([
      "evt-wc-enter",
      "evt-wc-text",
    ]);
    expect(wecom.every((row) => row.item.channelId === "wecom")).toBe(true);
    expect(wecom.map((row) => row.schema?.id)).toEqual(["wc-enter", "wc-text"]);

    const douyin = filterEvents(items, { ...NO_FILTERS, channel: "douyin" });
    expect(douyin.map((row) => row.item.id)).toEqual(["evt-dy"]);
    expect(douyin[0]?.schema?.id).toBe("dy-text");

    // 企微事件按 schema 的 kind 正确分类（wc-text=消息、wc-enter=事件）
    expect(
      filterEvents(items, {
        ...NO_FILTERS,
        channel: "wecom",
        kind: "event",
      }).map((row) => row.item.id),
    ).toEqual(["evt-wc-enter"]);
  });
});

describe("固定 seed 的确定性", () => {
  it("两次独立生成的样本完全一致", () => {
    const first = seededEvents(300);
    const second = seededEvents(300);
    expect(first).toEqual(second);
  });
});

/** 单条用户素材工厂（模板区测试用） */
function userEvent(overrides: Partial<EventItem> = {}): EventItem {
  return {
    id: "evt-user",
    name: "已保存素材",
    channelId: "douyin",
    schemaId: "dy-text",
    versions: [
      {
        revision: 1,
        savedAt: "2026-09-12T01:00:00.000Z",
        payload: { event: "stub" },
        expected: { status: 200, body: "", bodyMode: "contains" },
      },
    ],
    ...overrides,
  };
}

describe("templatesForChannel（目录模板源）", () => {
  it("all = 全渠道已接入模板；指定渠道 = 该渠道全部模板", () => {
    expect(templatesForChannel("all")).toHaveLength(EVENT_SCHEMAS.length);
    expect(templatesForChannel("douyin")).toHaveLength(33);
    expect(templatesForChannel("douyin")[0]?.id).toBe("dy-create-video");
    expect(templatesForChannel("douyin")[13]?.id).toBe(
      "dy-service-market-order",
    );
    expect(templatesForChannel("douyin")[14]?.id).toBe("dy-text");
    expect(templatesForChannel("douyin")[32]?.id).toBe("dy-isv-authorized");
    expect(templatesForChannel("wecom")).toHaveLength(89);
    expect(templatesForChannel("wecom")[0]?.id).toBe("wc-text");
    expect(templatesForChannel("wecom")[31]?.id).toBe("wc-active-restored");
    expect(templatesForChannel("wecom")[77]?.id).toBe(
      "wc-public-email-receive",
    );
    expect(templatesForChannel("wecom")[78]?.id).toBe("wb-text");
    expect(templatesForChannel("wecom")[88]?.id).toBe(
      "wb-event-template-card-menu",
    );
  });

  it("未在注册表接入模板的 id 返回空表（B站已接入 #49；知乎无推送不入表，以注册表外 id 验证空表路径）", () => {
    expect(templatesForChannel("zhihu" as ChannelId)).toEqual([]);
  });
});

describe("libraryRows（列表即目录：模板区在前，用户素材区在后）", () => {
  it("选定渠道后模板区在前，按消息 → 事件分组，用户素材区保持倒序", () => {
    const rows = libraryRows(seededEvents(20), schemasByChannel("douyin"), {
      ...NO_FILTERS,
      channel: "douyin",
    });
    // 16 条 douyin 用户素材 + 33 条抖音内置模板
    expect(rows).toHaveLength(49);
    const templateRows = rows.slice(0, 33);
    expect(templateRows.every((row) => row.region === "template")).toBe(true);
    // 分组固定消息在前（12 条消息模板）→ 事件模板按声明序
    expect(
      templateRows
        .slice(0, 12)
        .map((row) => (row.region === "template" ? row.schema.id : "")),
    ).toEqual([
      "dy-im-group-receive",
      "dy-im-group-send",
      "dy-text",
      "dy-image",
      "dy-emoji",
      "dy-video",
      "dy-local-image",
      "dy-retain-card",
      "dy-leads-phone-card",
      "dy-send-text",
      "dy-mg-im-text",
      "dy-mg-im-image",
    ]);
    const users = rows.slice(33);
    expect(users.every((row) => row.region === "user")).toBe(true);
    for (let i = 1; i < users.length; i += 1) {
      const previous = users[i - 1];
      const current = users[i];
      if (previous.region === "user" && current.region === "user") {
        expect(previous.updatedAt >= current.updatedAt).toBe(true);
      }
    }
  });

  it("kind 过滤作用于模板区：消息视图只留消息模板；收藏视图不含模板", () => {
    const messages = libraryRows([], schemasByChannel("douyin"), {
      ...NO_FILTERS,
      kind: "message",
    });
    expect(
      messages.map((row) => (row.region === "template" ? row.schema.id : "")),
    ).toEqual([
      "dy-im-group-receive",
      "dy-im-group-send",
      "dy-text",
      "dy-image",
      "dy-emoji",
      "dy-video",
      "dy-local-image",
      "dy-retain-card",
      "dy-leads-phone-card",
      "dy-send-text",
      "dy-mg-im-text",
      "dy-mg-im-image",
    ]);

    const favorites = libraryRows(
      [
        userEvent({ id: "evt-fav", favorite: true }),
        userEvent({ id: "evt-x" }),
      ],
      schemasByChannel("douyin"),
      { ...NO_FILTERS, kind: "favorite" },
    );
    expect(favorites.map((row) => row.region)).toEqual(["user"]);
    expect(
      favorites.map((row) => (row.region === "user" ? row.item.id : "")),
    ).toEqual(["evt-fav"]);
  });

  it("关键词搜索命中模板名称/官方事件名/渠道名，分组序保持消息在前", () => {
    const byName = libraryRows([], EVENT_SCHEMAS, {
      ...NO_FILTERS,
      query: "进入",
    });
    expect(
      byName.map((row) => (row.region === "template" ? row.schema.id : "")),
    ).toEqual([
      "dy-enter",
      "wc-enter",
      "wb-event-enter-chat",
      "wmn-enter-tempsession",
    ]);

    const byChannelName = libraryRows([], EVENT_SCHEMAS, {
      ...NO_FILTERS,
      query: "企业微信",
    });
    const channelRows = byChannelName.map((row) =>
      row.region === "template" ? row.schema : undefined,
    );
    expect(channelRows).toHaveLength(89);
    expect(channelRows.every((schema) => schema?.channelId === "wecom")).toBe(
      true,
    );

    const byEventName = libraryRows([], EVENT_SCHEMAS, {
      ...NO_FILTERS,
      query: "im_message_read",
    });
    expect(
      byEventName.map((row) =>
        row.region === "template" ? row.schema.id : "",
      ),
    ).toEqual(["dy-read"]);
  });

  it("分页选择器扩展覆盖组合列表：模板区计入总页数", () => {
    const items = Array.from({ length: 9 }, (_, i) =>
      userEvent({
        id: `evt-${String(i).padStart(4, "0")}`,
        name: `素材 ${i}`,
        versions: [
          {
            revision: 1,
            savedAt: new Date(Date.UTC(2026, 8, 12, 0, i)).toISOString(),
            payload: { event: "stub" },
            expected: { status: 200, body: "", bodyMode: "contains" },
          },
        ],
      }),
    );
    const rows = libraryRows(items, schemasByChannel("douyin"), NO_FILTERS);
    // 33 条内置模板 + 9 条用户素材
    expect(rows).toHaveLength(42);

    const first = paginateEvents(rows, 1);
    expect(first.total).toBe(42);
    expect(first.pages).toBe(5);
    expect(first.items.filter((row) => row.region === "template")).toHaveLength(
      10,
    );
    expect(first.items.filter((row) => row.region === "user")).toHaveLength(0);

    // 第 4 页收尾模板区并混入用户素材（模板区在前不跨页切换语义）
    const fourth = paginateEvents(rows, 4);
    expect(
      fourth.items.filter((row) => row.region === "template"),
    ).toHaveLength(3);
    expect(fourth.items.filter((row) => row.region === "user")).toHaveLength(7);

    const fifth = paginateEvents(rows, 5);
    expect(fifth.items).toHaveLength(2);
    expect(fifth.items.every((row) => row.region === "user")).toBe(true);
  });

  it("模板区不因用户素材为空而消失，点击目标始终可解析回模板", () => {
    const rows = libraryRows([], schemasByChannel("wecom"), NO_FILTERS);
    expect(rows).toHaveLength(89);
    expect(rows.every((row) => row.region === "template")).toBe(true);
    expect(rows[0]?.region === "template" && rows[0].schema.id).toBe("wc-text");
  });
});
