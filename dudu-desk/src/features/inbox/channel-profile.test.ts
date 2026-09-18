import { describe, expect, it } from "vitest";
import { formatChannelProfile } from "./channel-profile";
import type { VisitorIdentity } from "./types";

const identity: VisitorIdentity = {
  id: "visitor-1",
  externalUserId: "channel-visitor-42",
  channelId: "channel-1",
  channelName: "微信客服",
  accountId: "account-1",
  accountName: "品牌旗舰店",
};

describe("channel profile copy", () => {
  it("copies every field in display order, including unavailable values and source identity", () => {
    expect(
      formatChannelProfile(identity, [
        { label: "地区", value: { state: "available", value: "上海" } },
        { label: "手机号", value: { state: "not-provided" } },
        { label: "邮箱", value: { state: "empty" } },
        {
          label: "本次咨询",
          value: { state: "available", value: "托特包\n米白色" },
        },
      ]),
    ).toBe(
      "渠道资料\n渠道：微信客服\n渠道账号：品牌旗舰店\n地区：上海\n手机号：渠道未提供\n邮箱：内容为空\n本次咨询：托特包\n米白色\n来源身份：channel-visitor-42",
    );
  });

  it("keeps channel and identity details when the channel provides no extra fields", () => {
    expect(formatChannelProfile(identity, [])).toBe(
      "渠道资料\n渠道：微信客服\n渠道账号：品牌旗舰店\n来源身份：channel-visitor-42",
    );
  });
});
