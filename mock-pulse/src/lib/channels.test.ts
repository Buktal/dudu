import { describe, expect, it } from "vitest";

import { CHANNELS, channelById, isChannelId } from "./channels";

describe("渠道注册表", () => {
  it("首发只含抖音与企业微信两个渠道", () => {
    expect(CHANNELS.map((channel) => channel.id)).toEqual(["douyin", "wecom"]);
  });

  it("每个渠道都有名称与协议说明", () => {
    for (const channel of CHANNELS) {
      expect(channel.name.length).toBeGreaterThan(0);
      expect(channel.protocol.length).toBeGreaterThan(0);
      expect(channel.note.length).toBeGreaterThan(0);
    }
  });

  it("只有抖音的连接协议已实现", () => {
    const implemented = CHANNELS.filter((channel) => channel.implemented);
    expect(implemented.map((channel) => channel.id)).toEqual(["douyin"]);
  });

  it("channelById 返回注册渠道，未注册返回 undefined", () => {
    expect(channelById("douyin")?.name).toBe("抖音");
    expect(channelById("unknown")).toBeUndefined();
  });

  it("isChannelId 只认注册表内的渠道", () => {
    expect(isChannelId("douyin")).toBe(true);
    expect(isChannelId("wecom")).toBe(true);
    expect(isChannelId("dingtalk")).toBe(false);
  });
});
