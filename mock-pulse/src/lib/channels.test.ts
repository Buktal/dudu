import { describe, expect, it } from "vitest";

import {
  CHANNEL_REGISTRY,
  CHANNELS,
  type ChannelId,
  channelById,
  isChannelId,
} from "./channels";

describe("渠道注册表", () => {
  it("事实库覆盖的 19 个 HTTP 回调渠道全部入表，知乎不入表", () => {
    const ids = CHANNELS.map((channel) => channel.id);
    expect(ids).toHaveLength(19);
    expect(ids).toEqual([
      "douyin",
      "wecom",
      "xiaohongshu",
      "feishu",
      "weibo",
      "wechat-mp",
      "wechat-mini",
      "dingtalk",
      "qq",
      "taobao",
      "jingdong",
      "pinduoduo",
      "meituan",
      "eleme",
      "bilibili",
      "kuaishou",
      "alipay",
      "whatsapp",
      "telegram",
    ]);
    expect(ids).not.toContain("zhihu");
  });

  it("渠道标识由注册表派生：ChannelId 与注册表键一一对应", () => {
    expect(Object.keys(CHANNEL_REGISTRY).sort()).toEqual(
      CHANNELS.map((channel) => channel.id).sort(),
    );
    expect(Object.keys(CHANNEL_REGISTRY)).not.toContain("__proto__");
  });

  it("每个渠道都有名称/协议/图标说明，条目内无 id 字段（键即 id）", () => {
    for (const channel of CHANNELS) {
      expect(channel.name.length, channel.id).toBeGreaterThan(0);
      expect(channel.protocol.length, channel.id).toBeGreaterThan(0);
      expect(channel.note.length, channel.id).toBeGreaterThan(0);
      // 图标键已解析为组件（forwardref 组件在产物中为函数或对象，不再是字符串键）
      expect(typeof channel.icon, channel.id).not.toBe("string");
    }
  });

  it("抖音/企微/公众号已实现连接适配器，其余渠道在选择器可见但不可连", () => {
    const implemented = CHANNELS.filter((channel) => channel.implemented);
    expect(implemented.map((channel) => channel.id)).toEqual([
      "douyin",
      "wecom",
      "wechat-mp",
    ]);
  });

  it("淘宝条目取全球栈 HTTP 回调形态并带「全球栈」标注", () => {
    const taobao = channelById("taobao");
    expect(taobao?.globalStack).toBe(true);
    expect(taobao?.protocol).toContain("全球栈");
    expect(CHANNELS.filter((channel) => channel.globalStack)).toEqual([taobao]);
  });

  it("channelById 返回注册渠道，未注册返回 undefined", () => {
    expect(channelById("douyin")?.name).toBe("抖音");
    expect(channelById("wecom")?.name).toBe("企业微信");
    expect(channelById("telegram")?.name).toBe("Telegram");
    expect(channelById("unknown")).toBeUndefined();
    expect(channelById("toString")).toBeUndefined();
  });

  it("isChannelId 只认注册表内的渠道", () => {
    expect(isChannelId("douyin")).toBe(true);
    expect(isChannelId("feishu")).toBe(true);
    expect(isChannelId("zhihu")).toBe(false);
    expect(isChannelId("dingtalk-old")).toBe(false);
    expect(isChannelId("toString")).toBe(false);
    expect(isChannelId(3)).toBe(false);
  });

  it("ChannelId 类型与注册表键一致（编译期契约的运行时抽查）", () => {
    const sample: ChannelId = "qq";
    expect(isChannelId(sample)).toBe(true);
  });
});
