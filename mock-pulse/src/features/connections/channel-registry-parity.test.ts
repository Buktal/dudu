import { describe, expect, it } from "vitest";

import { CHANNEL_REGISTRY, type ChannelId } from "@/lib/channels";

import { EVENT_SCHEMAS, schemasByChannel } from "../events/schemas";
import { channelTraitOrNull, DEFAULT_CONNECTIONS } from "./channel-traits";

/**
 * 三表渠道键对齐钉（C6）：渠道注册表（lib/channels.ts CHANNEL_REGISTRY）
 * × 接入描述表（channelTraits 行集）× 事件模板聚合表（schemas PACKS，
 * 经 EVENT_SCHEMAS / schemasByChannel 公开投影）三者均以同一渠道 id 为键。
 * 表本身不合并（Rust 渠道配置与 JSON 渠道描述文件各自锚定），键漂移由
 * 本测试拦截；trim 语义钉在 ./channel-traits-trim.test.ts，不在此重复。
 */

const REGISTRY_IDS = Object.keys(CHANNEL_REGISTRY).sort();

describe("三表渠道键对齐", () => {
  it("接入描述表覆盖注册表全部渠道（无多无少）", () => {
    expect(Object.keys(DEFAULT_CONNECTIONS).sort()).toEqual(REGISTRY_IDS);
    for (const id of REGISTRY_IDS) {
      expect(channelTraitOrNull(id), id).toBeDefined();
    }
  });

  it("模板聚合表覆盖注册表全部渠道（每渠道至少一个模板）", () => {
    for (const id of REGISTRY_IDS) {
      expect(schemasByChannel(id as ChannelId).length, id).toBeGreaterThan(0);
    }
  });

  it("模板聚合表不含注册表外渠道（PACKS 键 ⊆ 注册表键）", () => {
    for (const schema of EVENT_SCHEMAS) {
      expect(CHANNEL_REGISTRY[schema.channelId], schema.id).toBeDefined();
    }
  });

  it("运行时未知渠道 fail-safe：描述表返回 undefined", () => {
    expect(channelTraitOrNull("zhihu")).toBeUndefined();
  });
});
