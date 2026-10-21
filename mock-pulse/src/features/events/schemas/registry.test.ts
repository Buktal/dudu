import { describe, expect, it } from "vitest";

import type { ChannelId } from "@/lib/channels";
import { parseWireDraft, wireBodyText } from "../payload";

import { ALI_DEFINITIONS } from "./alipay";
import { BILI_DEFINITIONS } from "./bilibili";
import { defineSchema } from "./define";
import { DINGTALK_DEFINITIONS } from "./dingtalk";
import { DOUYIN_DEFINITIONS } from "./douyin";
import { ELE_DEFINITIONS } from "./eleme";
import { FEISHU_DEFINITIONS } from "./feishu";
import { JD_DEFINITIONS } from "./jingdong";
import { KS_DEFINITIONS } from "./kuaishou";
import { MT_DEFINITIONS } from "./meituan";
import { PDD_DEFINITIONS } from "./pinduoduo";
import { QQ_DEFINITIONS } from "./qq";
import { EVENT_SCHEMAS, schemaById, schemasByChannel } from "./registry";
import { TB_DEFINITIONS } from "./taobao";
import { TG_DEFINITIONS } from "./telegram";
import { MINI_DEFINITIONS } from "./wechat-mini";
import { MP_DEFINITIONS } from "./wechat-mp";
import { WECOM_DEFINITIONS } from "./wecom";
import { WB_DEFINITIONS } from "./weibo";
import { WA_DEFINITIONS } from "./whatsapp";
import { XHS_DEFINITIONS } from "./xiaohongshu";

/**
 * 事件模板聚合注册表的不变量单测（总数/唯一性/渠道一致性/描述同源/字段描述
 * 完整性/载荷逐字节自反/期望回执形态/schemaById/defineSchema）。自旧单文件按
 * 主题拆分（单文件 ≤ 500 行，code-review 退件）：各渠道模板 id 清单在
 * ./registry-listing.test.ts 与 ./registry-listing-trade.test.ts，渠道文件的
 * 两类通用不变量（字段描述完整性/载荷自反）单点上收到本文件全表循环。
 */

const DEFINITIONS_BY_CHANNEL = {
  douyin: DOUYIN_DEFINITIONS,
  wecom: WECOM_DEFINITIONS,
  xiaohongshu: XHS_DEFINITIONS,
  "wechat-mp": MP_DEFINITIONS,
  "wechat-mini": MINI_DEFINITIONS,
  feishu: FEISHU_DEFINITIONS,
  dingtalk: DINGTALK_DEFINITIONS,
  qq: QQ_DEFINITIONS,
  weibo: WB_DEFINITIONS,
  kuaishou: KS_DEFINITIONS,
  taobao: TB_DEFINITIONS,
  jingdong: JD_DEFINITIONS,
  pinduoduo: PDD_DEFINITIONS,
  meituan: MT_DEFINITIONS,
  eleme: ELE_DEFINITIONS,
  bilibili: BILI_DEFINITIONS,
  alipay: ALI_DEFINITIONS,
  whatsapp: WA_DEFINITIONS,
  telegram: TG_DEFINITIONS,
} as const;

describe("事件模板聚合注册表", () => {
  it("抖音 33 + 企微 89 + 小红书 17 + 公众号 26 + 小程序 7 + 飞书 7 + 钉钉 14 + QQ 8 + 微博 12 + 快手 8 + 淘宝 5 + 京东 12 + 拼多多 3 + 美团 4 + 饿了么 6 + B站 4 + 支付宝 3 + WhatsApp 9 + Telegram 7 个模板全部入表，id 全仓库唯一", () => {
    expect(EVENT_SCHEMAS).toHaveLength(274);
    const ids = EVENT_SCHEMAS.map((schema) => schema.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("每个模板的 channelId 与所在渠道包一致（协议模块与描述文件同渠道）", () => {
    for (const channelId of [
      "douyin",
      "wecom",
      "xiaohongshu",
      "wechat-mp",
      "wechat-mini",
      "feishu",
      "dingtalk",
      "qq",
      "weibo",
      "kuaishou",
      "taobao",
      "jingdong",
      "pinduoduo",
      "meituan",
      "eleme",
      "bilibili",
      "alipay",
      "whatsapp",
      "telegram",
    ] as const) {
      const definitions = DEFINITIONS_BY_CHANNEL[channelId];
      for (const schema of schemasByChannel(channelId)) {
        expect(schema.channelId).toBe(channelId);
        expect(definitions.channelId).toBe(channelId);
      }
    }
  });

  it("模板版本/来源/字段与描述文件同源（装载即校验后的数据契约）", () => {
    for (const schema of EVENT_SCHEMAS) {
      expect(schema.channelId in DEFINITIONS_BY_CHANNEL, schema.channelId).toBe(
        true,
      );
      const entry =
        DEFINITIONS_BY_CHANNEL[
          schema.channelId as keyof typeof DEFINITIONS_BY_CHANNEL
        ].schemas[schema.id];
      expect(entry, `${schema.id} 描述文件条目`).toBeDefined();
      expect(schema.version).toBe(entry?.version);
      expect(schema.source).toBe(entry?.source);
      expect(schema.fields).toEqual(entry?.fields);
    }
  });

  it("每个模板每个字段都有标题/类型/分组/解释（全渠道循环）", () => {
    for (const schema of EVENT_SCHEMAS) {
      for (const field of schema.fields) {
        const where = `${schema.channelId} ${schema.id}.${field.path}`;
        expect(field.title, `${where} title`).toBeTruthy();
        expect(field.type, `${where} type`).toBeTruthy();
        expect(field.group, `${where} group`).toBeTruthy();
        expect(field.description, `${where} description`).toBeTruthy();
      }
    }
  });

  it("每个模板载荷逐字节自反：线上报文 ↔ 载荷解析往返一致（全渠道循环）", () => {
    for (const schema of EVENT_SCHEMAS) {
      const where = `${schema.channelId} ${schema.id}`;
      const text = wireBodyText(schema, schema.payload);
      const parsed = parseWireDraft(schema, text);
      expect(parsed, `${where} 往返载荷`).toEqual(schema.payload);
      expect(wireBodyText(schema, parsed), `${where} 往返明文`).toBe(text);
    }
  });

  it("每个模板带渠道真实默认期望回执：状态码合法、正文形态在枚举内", () => {
    for (const schema of EVENT_SCHEMAS) {
      expect(
        schema.expected.status,
        `${schema.id} status`,
      ).toBeGreaterThanOrEqual(100);
      expect(schema.expected.status, `${schema.id} status`).toBeLessThanOrEqual(
        599,
      );
      expect([
        "contains",
        "equals",
        "jsonField",
        "wecomReply",
        "dingtalkReply",
        "qqSignReply",
      ]).toContain(schema.expected.bodyMode);
    }
  });

  it("schemasByChannel：不在 PACKS 的渠道（尚未接入模板）返回空表", () => {
    // 知乎无推送可 mock、不入表（事实库结论）
    expect(schemasByChannel("zhihu" as ChannelId)).toEqual([]);
  });

  it("schemaById：全表命中，未命中抛出明确错误", () => {
    for (const schema of EVENT_SCHEMAS) {
      expect(schemaById(schema.id).id).toBe(schema.id);
    }
    expect(() => schemaById("missing")).toThrow("未知事件模板");
  });

  it("defineSchema：描述文件缺条目时装载即炸（协议模块与文件脱节）", () => {
    expect(() =>
      defineSchema(DOUYIN_DEFINITIONS, "dy-missing", {
        eventName: "x",
        name: "x",
        kind: "event",
        contentString: false,
        wire: "json",
        expected: { status: 200, body: "", bodyMode: "contains" },
        idGenerations: [],
        payload: {},
      }),
    ).toThrow("未知事件模板的字段定义");
  });
});
