import { describe, expect, it } from "vitest";

import {
  appendVersion,
  createDraft,
  draftFromItem,
  isDraftDirty,
} from "./model";
import {
  parseWireDraft,
  setPayloadField,
  wireBodyText,
  wireDraftText,
  withCustomField,
} from "./payload";
import type { XmlLayout } from "./schemas";
import { schemaById } from "./schemas";
import { buildXmlBody, parseXmlBody } from "./xml";

/**
 * 企微 XML 载荷确定性拼装。黄金样本逐字取自
 * docs/research/channels/wecom.md §5.2 / §5.3（官方文档原文拷贝，
 * 注意 §5.2 FromUserName 行尾有一个空格——原文如此）。
 */

/** 消息类排版（§5.2：三空格缩进 + FromUserName 行尾空格） */
const MESSAGE_LAYOUT: XmlLayout = {
  indent: "   ",
  bareTags: ["CreateTime", "MsgId", "AgentID"],
  trailingSpaceTags: ["FromUserName"],
};

/** 事件类排版（§5.3/§5.4 官方事件样本：tab 缩进、无行尾空格） */
const EVENT_LAYOUT: XmlLayout = {
  indent: "\t",
  bareTags: ["CreateTime", "MsgId", "AgentID"],
};

const TEXT_TAGS = [
  "ToUserName",
  "FromUserName",
  "CreateTime",
  "MsgType",
  "Content",
  "MsgId",
  "AgentID",
] as const;

const EVENT_TAGS = [
  "ToUserName",
  "FromUserName",
  "CreateTime",
  "MsgType",
  "Event",
  "EventKey",
  "AgentID",
] as const;

/** 官方 §5.2 文本消息黄金样本（逐字；FromUserName 行尾空格为官方原文） */
const GOLDEN_WC_TEXT = [
  "<xml>",
  "   <ToUserName><![CDATA[toUser]]></ToUserName>",
  "   <FromUserName><![CDATA[fromUser]]></FromUserName> ",
  "   <CreateTime>1348831860</CreateTime>",
  "   <MsgType><![CDATA[text]]></MsgType>",
  "   <Content><![CDATA[this is a test]]></Content>",
  "   <MsgId>1234567890123456</MsgId>",
  "   <AgentID>1</AgentID>",
  "</xml>",
].join("\n");

/** 官方 §5.3 subscribe 事件黄金样本（逐字；tab 缩进） */
const GOLDEN_WC_SUBSCRIBE = [
  "<xml>",
  "\t<ToUserName><![CDATA[toUser]]></ToUserName>",
  "\t<FromUserName><![CDATA[UserID]]></FromUserName>",
  "\t<CreateTime>1348831860</CreateTime>",
  "\t<MsgType><![CDATA[event]]></MsgType>",
  "\t<Event><![CDATA[subscribe]]></Event>",
  "\t<AgentID>1</AgentID>",
  "</xml>",
].join("\n");

describe("buildXmlBody 黄金样本", () => {
  it("文本消息（§5.2）：逐字复现官方明文（含行尾空格与三空格缩进）", () => {
    const payload = {
      ToUserName: "toUser",
      FromUserName: "fromUser",
      CreateTime: "1348831860",
      MsgType: "text",
      Content: "this is a test",
      MsgId: "1234567890123456",
      AgentID: "1",
    };
    expect(buildXmlBody(MESSAGE_LAYOUT, TEXT_TAGS, payload)).toBe(
      GOLDEN_WC_TEXT,
    );
  });

  it("subscribe 事件（§5.3）：逐字复现官方明文（tab 缩进）", () => {
    const payload = {
      ToUserName: "toUser",
      FromUserName: "UserID",
      CreateTime: "1348831860",
      MsgType: "event",
      Event: "subscribe",
      AgentID: "1",
    };
    expect(
      buildXmlBody(
        EVENT_LAYOUT,
        EVENT_TAGS.filter((tag) => tag !== "EventKey"),
        payload,
      ),
    ).toBe(GOLDEN_WC_SUBSCRIBE);
  });

  it("确定性：同一载荷两次拼装逐字节一致", () => {
    const payload = parseXmlBody(TEXT_TAGS, GOLDEN_WC_TEXT);
    expect(buildXmlBody(MESSAGE_LAYOUT, TEXT_TAGS, payload)).toBe(
      buildXmlBody(MESSAGE_LAYOUT, TEXT_TAGS, payload),
    );
  });
});

describe("parseXmlBody 报文解析", () => {
  it("解析 §5.2 黄金样本：扁平对象、值全为字符串（MsgId 不经数字）", () => {
    const payload = parseXmlBody(TEXT_TAGS, GOLDEN_WC_TEXT);
    expect(payload).toEqual({
      ToUserName: "toUser",
      FromUserName: "fromUser",
      CreateTime: "1348831860",
      MsgType: "text",
      Content: "this is a test",
      MsgId: "1234567890123456",
      AgentID: "1",
    });
    expect(typeof payload.MsgId).toBe("string");
    // 键序 = 文档序
    expect(Object.keys(payload)).toEqual([...TEXT_TAGS]);
  });

  it("拼装→解析→拼装逐字节一致（行尾空格由排版规则复现）", () => {
    const once = buildXmlBody(
      MESSAGE_LAYOUT,
      TEXT_TAGS,
      parseXmlBody(TEXT_TAGS, GOLDEN_WC_TEXT),
    );
    expect(once).toBe(GOLDEN_WC_TEXT);
  });

  it("未知元素以原文片段保存：裸文本/CDATA 形态往返逐字保留", () => {
    const raw = [
      "<xml>",
      "\t<ToUserName><![CDATA[toUser]]></ToUserName>",
      "\t<Status>1</Status>",
      "\t<WelcomeCode><![CDATA[WC123]]></WelcomeCode>",
      "</xml>",
    ].join("\n");
    const payload = parseXmlBody(["ToUserName"], raw);
    // 未知元素的值 = 完整原文片段（含原始 CDATA 形态）
    expect(payload).toEqual({
      ToUserName: "toUser",
      Status: "<Status>1</Status>",
      WelcomeCode: "<WelcomeCode><![CDATA[WC123]]></WelcomeCode>",
    });
    // 再拼装：未知片段原样回填，逐字节一致
    expect(buildXmlBody(EVENT_LAYOUT, ["ToUserName"], payload)).toBe(raw);
  });

  it("容忍 CRLF 行尾与空行", () => {
    const payload = parseXmlBody(
      TEXT_TAGS,
      GOLDEN_WC_TEXT.replace(/\n/g, "\r\n"),
    );
    expect(payload.MsgType).toBe("text");
    expect(payload.Content).toBe("this is a test");
  });

  it("结构非法时报可读错误：缺 xml 包裹 / 元素行不可解析 / 保留字段名", () => {
    expect(() => parseXmlBody(TEXT_TAGS, "<xml>")).toThrow("xml");
    expect(() => parseXmlBody(TEXT_TAGS, "<xml>\nnaked text\n</xml>")).toThrow(
      "元素",
    );
    expect(() =>
      parseXmlBody(
        TEXT_TAGS,
        "<xml>\n<FromUserName><![CDATA[x]]></FromUserName>\n</xml>\n<extra/>",
      ),
    ).toThrow("结尾");
    expect(() =>
      parseXmlBody(TEXT_TAGS, "<xml>\n<__proto__>x</__proto__>\n</xml>"),
    ).toThrow("保留");
  });
});

describe("schema 驱动的线上拼装与解析", () => {
  it("wc-text 模板载荷经 wireBodyText 产出 §5.2 黄金明文（逐字）", () => {
    const schema = schemaById("wc-text");
    expect(wireBodyText(schema, schema.payload)).toBe(GOLDEN_WC_TEXT);
  });

  it("wc-enter/wc-click：事件字段集按 §2.2 构造，事件无 MsgId", () => {
    const enterSchema = schemaById("wc-enter");
    const enter = wireBodyText(enterSchema, enterSchema.payload);
    expect(enter).toContain("<MsgType><![CDATA[event]]></MsgType>");
    expect(enter).toContain("<Event><![CDATA[enter_agent]]></Event>");
    expect(enter).toContain("<EventKey><![CDATA[]]></EventKey>");
    expect(enter).not.toContain("<MsgId>");

    const clickSchema = schemaById("wc-click");
    const click = wireBodyText(clickSchema, clickSchema.payload);
    expect(click).toContain("<Event><![CDATA[click]]></Event>");
    expect(click).toContain("<EventKey><![CDATA[EVENTKEY]]></EventKey>");
    expect(click).not.toContain("<MsgId>");
    // 事件排版 = tab 缩进（§5.3 事件样本形态）
    expect(click.split("\n")[1].startsWith("\t")).toBe(true);
  });

  it("抖音模板仍走 JSON：wireBodyText 产出紧凑规范形", () => {
    const schema = schemaById("dy-text");
    const body = wireBodyText(schema, schema.payload);
    expect(body).toBe(JSON.stringify(schema.payload));
  });

  it("wireDraftText/parseWireDraft：报文页往返（XML ↔ 载荷）", () => {
    const schema = schemaById("wc-text");
    const text = wireDraftText(schema, schema.payload);
    expect(text).toBe(GOLDEN_WC_TEXT);
    const parsed = parseWireDraft(schema, text);
    expect(parsed).toEqual(schema.payload);
    // 未知元素经报文页加入后原样保留
    const withUnknown = parseWireDraft(
      schema,
      [
        "<xml>",
        "   <ToUserName><![CDATA[toUser]]></ToUserName>",
        "   <Status>1</Status>",
        "</xml>",
      ].join("\n"),
    );
    expect(withUnknown.Status).toBe("<Status>1</Status>");
  });

  it("MsgId 64 位整型全程按字符串保真：编辑→保存→重载→拼装", () => {
    const bigId = "7151772163216742434"; // 19 位 > 2^53，number 必丢精度
    const schema = schemaById("wc-text");
    const draft = createDraft("企微文本", schema);
    const edited = {
      ...draft,
      payload: setPayloadField(draft.payload, "MsgId", bigId),
    };
    expect(typeof edited.payload.MsgId).toBe("string");

    // 保存为版本（线上形态）→ 事件重载
    const event = appendVersion(null, edited, "2026-09-12T01:00:00.000Z");
    expect(typeof event.versions[0].payload.MsgId).toBe("string");
    const reloaded = draftFromItem(event);
    expect(reloaded.payload.MsgId).toBe(bigId);
    expect(isDraftDirty(event, reloaded)).toBe(false);

    // 拼装线上明文：数字串原样输出，不经 Number
    const xml = wireBodyText(schema, reloaded.payload);
    expect(xml).toContain(`<MsgId>${bigId}</MsgId>`);
  });
});

describe("XML 编辑往返回归", () => {
  it("紧凑 XML 按文本语义解码实体、数字引用和相邻 CDATA", () => {
    const payload = parseXmlBody(
      TEXT_TAGS,
      "<xml><Content>a &amp; b &#x4e2d; &#25991; &lt;tag&gt; &quot; &apos;<![CDATA[ &amp; ]]><![CDATA[后续]]></Content><MsgId>7151772163216742434</MsgId></xml>",
    );
    expect(payload.Content).toBe("a & b 中 文 <tag> \" ' &amp; 后续");
    expect(payload.MsgId).toBe("7151772163216742434");
    expect(
      parseXmlBody(TEXT_TAGS, buildXmlBody(MESSAGE_LAYOUT, TEXT_TAGS, payload)),
    ).toEqual(payload);
  });

  it("CDATA 内的完整结束标签不会提前结束字段", () => {
    const payload = {
      Content: "第一行\n</Content>\n<Extra>文本</Extra>\n最后一行",
    };
    expect(
      parseXmlBody(TEXT_TAGS, buildXmlBody(MESSAGE_LAYOUT, TEXT_TAGS, payload)),
    ).toEqual(payload);
  });

  it("未知元素保留嵌套、实体、属性引号和自闭合元素原文", () => {
    const fragment =
      "<Extra note='x > y'><Inner/><!-- </Extra> --><![CDATA[</Extra>]]>&amp;</Extra>";
    const payload = parseXmlBody(TEXT_TAGS, `<xml>${fragment}<Empty /></xml>`);
    expect(payload).toEqual({ Extra: fragment, Empty: "<Empty />" });
    const raw = buildXmlBody(EVENT_LAYOUT, TEXT_TAGS, payload);
    expect(raw).toContain(fragment);
    expect(parseXmlBody(TEXT_TAGS, raw)).toEqual(payload);
  });

  it("非 CDATA 字段同样正确转义 XML 文本", () => {
    const payload = { AgentID: "a & b < c > d" };
    const raw = buildXmlBody(MESSAGE_LAYOUT, TEXT_TAGS, payload);
    expect(raw).toContain("<AgentID>a &amp; b &lt; c &gt; d</AgentID>");
    expect(parseXmlBody(TEXT_TAGS, raw)).toEqual(payload);
  });

  it("拒绝重复元素、畸形 XML 和无法保真编辑的已知字段结构", () => {
    expect(() =>
      parseXmlBody(TEXT_TAGS, "<xml><Content/><Content/></xml>"),
    ).toThrow("重复");
    expect(() =>
      parseXmlBody(TEXT_TAGS, "<xml><Content>&wrong;</Content></xml>"),
    ).toThrow("XML");
    expect(() =>
      parseXmlBody(TEXT_TAGS, "<xml><Content><Inner/></Content></xml>"),
    ).toThrow("文本");
    expect(() =>
      parseXmlBody(TEXT_TAGS, '<xml><Content key="x">text</Content></xml>'),
    ).toThrow("属性");
  });

  it("多行 CDATA 保留空行、缩进和结束符文本", () => {
    const payload = { Content: "第一行\n\n  第三行与 ]]> 文本" };
    const raw = buildXmlBody(MESSAGE_LAYOUT, TEXT_TAGS, payload);
    expect(parseXmlBody(TEXT_TAGS, raw)).toEqual(payload);
    expect(
      buildXmlBody(MESSAGE_LAYOUT, TEXT_TAGS, parseXmlBody(TEXT_TAGS, raw)),
    ).toBe(raw);
  });

  it("自定义文本编码为 XML 元素，拒绝对象值和嵌套路径", () => {
    const schema = schemaById("wc-text");
    const payload = withCustomField(schema, {}, "Extra", "甲 & <乙>");
    const raw = wireBodyText(schema, payload);
    expect(raw).toContain("<Extra><![CDATA[甲 & <乙>]]></Extra>");
    expect(wireBodyText(schema, parseWireDraft(schema, raw))).toBe(raw);
    expect(() =>
      withCustomField(schema, {}, "Extra", { nested: true }),
    ).toThrow("文本");
    expect(() => withCustomField(schema, {}, "Extra[0]", "abc")).toThrow(
      "元素名",
    );
  });
});
