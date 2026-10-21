import { describe, expect, it } from "vitest";

import { bilibiliTimestamp } from "@/lib/time";

import { applyGeneratedIds } from "../ids";
import { BILI_DEFINITIONS, BILI_SCHEMAS } from "./bilibili";

/** 官方示例公共值（事实库 §5.2–§5.5 逐字；openid 尾部空格原文如此） */
const GOLDEN_OPENID = "9205eeaa1879skxys969ed47874f225c3 ";
const GOLDEN_CLIENT_ID = "395c8275dd674f17";
const GOLDEN_TIMESTAMP = "2021-01-01 12:01:01";

const schemaOf = (schemaId: string) => {
  const schema = BILI_SCHEMAS.find((item) => item.id === schemaId);
  expect(schema, schemaId).toBeDefined();
  if (!schema) throw new Error(schemaId);
  return schema;
};

describe("B站事件 schema 聚合（开放平台 Webhooks；签名头表与 verify_webhooks 探针在 Rust 适配器）", () => {
  it("封闭 4 事件模板，id 全仓库唯一且 bili- 前缀（官方事件表封闭：authorize/deauthorize/video_open/video_fail）", () => {
    expect(BILI_SCHEMAS).toHaveLength(4);
    const ids = BILI_SCHEMAS.map((schema) => schema.id);
    expect(ids).toEqual([
      "bili-authorize",
      "bili-deauthorize",
      "bili-video-open",
      "bili-video-fail",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("bili-"))).toBe(true);
    // 事件名封闭（§2.2 事件表四行），无私信/客服事件（§2.3 禁令原文不入模板）
    expect(BILI_SCHEMAS.map((schema) => schema.eventName)).toEqual([
      "authorize",
      "deauthorize",
      "video_open",
      "video_fail",
    ]);
  });

  it("描述文件装载合法，且模板条目与协议模块一一对应", () => {
    expect(BILI_DEFINITIONS.channelId).toBe("bilibili");
    expect(BILI_DEFINITIONS.version).toBe("2026.09");
    expect(Object.keys(BILI_DEFINITIONS.schemas).sort()).toEqual(
      BILI_SCHEMAS.map((schema) => schema.id).sort(),
    );
  });

  it("报文形态绑定：全部模板走 JSON 明文（HTTPS POST，§4.3 无加密记载）", () => {
    for (const schema of BILI_SCHEMAS) {
      expect(schema.wire, `${schema.id} wire`).toBe("json");
      expect(schema.contentString, `${schema.id} contentString`).toBe(false);
      expect(schema.kind, `${schema.id} kind`).toBe("event");
    }
  });

  it("默认期望回执 = 渠道真实应答：HTTP 200（5s 建连超时、失败最多共推 3 次、官方无幂等键照录注释）", () => {
    for (const schema of BILI_SCHEMAS) {
      // 事实库 §3.3 镜像口径照录：事件推送正文无官方口径——空串 = 只看状态码
      expect(schema.expected, `${schema.id} expected`).toEqual({
        status: 200,
        body: "",
        bodyMode: "contains",
      });
    }
  });

  it("事件信封键序（§2.2 官方包络：event → content → timestamp，timestamp 为 UTC+8 字符串）", () => {
    for (const schema of BILI_SCHEMAS) {
      const keys = Object.keys(schema.payload);
      expect(keys, `${schema.id} 信封键序`).toEqual([
        "event",
        "content",
        "timestamp",
      ]);
      expect(schema.payload.event).toBe(schema.eventName);
      expect(schema.payload.timestamp).toBe(GOLDEN_TIMESTAMP);
    }
  });

  it("authorize 载荷逐字（§5.2 镜像样本值，openid 尾部空格原文照录）", () => {
    const schema = schemaOf("bili-authorize");
    expect(schema.payload.event).toBe("authorize");
    expect(schema.payload.content).toEqual({
      openid: GOLDEN_OPENID,
      client_id: GOLDEN_CLIENT_ID,
      permits: "USER_INFO, USER_DATA",
    });
    // content 键序照官方样本：openid → client_id → permits
    expect(Object.keys(schema.payload.content as object)).toEqual([
      "openid",
      "client_id",
      "permits",
    ]);
    // 官方示例 openid 尾部空格为原文照录（§5.2–§5.5 四条一致）
    expect(
      String((schema.payload.content as { openid: string }).openid).endsWith(
        " ",
      ),
    ).toBe(true);
  });

  it("deauthorize 载荷逐字（§5.3 官方页印证样本：permits 为解除授权的权限列表）", () => {
    const schema = schemaOf("bili-deauthorize");
    expect(schema.source).toBe(
      "https://open.bilibili.com/doc/4/a3f37dde-212b-b71b-5388-fbd3bfb41623",
    );
    expect(schema.payload.event).toBe("deauthorize");
    expect(schema.payload.content).toEqual({
      openid: GOLDEN_OPENID,
      client_id: GOLDEN_CLIENT_ID,
      permits: "ATC_DATA, ATC_BASE",
    });
  });

  it("video_open 载荷逐字（§5.4 镜像样本：state 0 / 开放浏览）", () => {
    const schema = schemaOf("bili-video-open");
    expect(schema.payload.event).toBe("video_open");
    expect(schema.payload.content).toEqual({
      openid: GOLDEN_OPENID,
      client_id: GOLDEN_CLIENT_ID,
      resource_id: "BV1S9L90H082",
      state: 0,
      state_desc: "开放浏览",
    });
    // content 键序照官方样本：openid → client_id → resource_id → state → state_desc
    expect(Object.keys(schema.payload.content as object)).toEqual([
      "openid",
      "client_id",
      "resource_id",
      "state",
      "state_desc",
    ]);
    expect((schema.payload.content as { state: number }).state).toStrictEqual(
      0,
    );
  });

  it("video_fail 载荷逐字（§5.5 镜像样本：state -2 / 已退回）", () => {
    const schema = schemaOf("bili-video-fail");
    expect(schema.payload.event).toBe("video_fail");
    expect(schema.payload.content).toEqual({
      openid: GOLDEN_OPENID,
      client_id: GOLDEN_CLIENT_ID,
      resource_id: "BV1S9L90H082",
      state: -2,
      state_desc: "已退回",
    });
    expect((schema.payload.content as { state: number }).state).toStrictEqual(
      -2,
    );
  });

  it("新建事件按官方形态重生成 ID：openid/client_id/BV 号/timestamp（UTC+8）", () => {
    for (const schema of BILI_SCHEMAS) {
      const generated = applyGeneratedIds(
        schema,
        schema.payload as Record<string, unknown>,
      );
      const content = generated.content as Record<string, unknown>;
      expect(generated).not.toEqual(schema.payload);
      // openid：32 位小写字母数字混淆串（官方示例混入非 hex 字符的形态）
      expect(content.openid).toMatch(/^[0-9a-z]{32}$/);
      expect(content.openid).not.toBe(GOLDEN_OPENID.trim());
      // client_id：16 位小写十六进制（x-bili-accesskeyid 同值）
      expect(content.client_id).toMatch(/^[0-9a-f]{16}$/);
      expect(content.client_id).not.toBe(GOLDEN_CLIENT_ID);
      // timestamp：yyyy-MM-dd HH:mm:ss（UTC+8），与官方占位样本不同
      expect(generated.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
      );
      expect(generated.timestamp).not.toBe(GOLDEN_TIMESTAMP);
      if ("resource_id" in content) {
        // BV 号：BV + 10 位 base58 字母数字（去易混 0OIl）
        expect(content.resource_id).toMatch(/^BV[1-9A-HJ-NP-Za-km-z]{10}$/);
        expect(content.resource_id).not.toBe("BV1S9L90H082");
      }
      if ("permits" in content) {
        // permits 为业务口径固定值，不重生成
        expect(content.permits).toMatch(/^[A-Z_]+, [A-Z_]+$/);
      }
    }
  });

  it("bilibiliTimestamp 固定 UTC+8 偏移（与运行机器时区无关）", () => {
    // 2021-01-01T04:01:01Z → UTC+8 = 2021-01-01 12:01:01（官方样本时刻同刻）
    expect(bilibiliTimestamp(1609473661000)).toBe("2021-01-01 12:01:01");
    // epoch 0 → 1970-01-01 08:00:00（东八区零点）
    expect(bilibiliTimestamp(0)).toBe("1970-01-01 08:00:00");
    // 跨日边界：2021-01-01T15:59:59Z（1609516799000）→ UTC+8 = 2021-01-01 23:59:59
    expect(bilibiliTimestamp(1609516799000)).toBe("2021-01-01 23:59:59");
    // 再 +1s 跨日：UTC+8 = 2021-01-02 00:00:00
    expect(bilibiliTimestamp(1609516800000)).toBe("2021-01-02 00:00:00");
  });
});
