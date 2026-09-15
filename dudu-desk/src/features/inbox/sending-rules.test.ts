import { describe, expect, it } from "vitest";
import { composerIntent } from "./sending-rules";

const enter = {
  key: "Enter",
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  isComposing: false,
};

describe("composer keyboard intent", () => {
  it("leaves composition confirmation and Shift+Enter to the text input", () => {
    expect(composerIntent({ ...enter, isComposing: true })).toBeNull();
    expect(composerIntent({ ...enter, keyCode: 229 })).toBeNull();
    expect(composerIntent({ ...enter, shiftKey: true })).toBeNull();
  });
  it("distinguishes plain send from the explicit next-visitor action", () => {
    expect(composerIntent(enter)).toBe("send");
    expect(composerIntent({ ...enter, ctrlKey: true })).toBe("next");
  });
});
