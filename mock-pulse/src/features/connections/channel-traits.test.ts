import { describe, expect, it } from "vitest";

import { CHANNEL_REGISTRY } from "@/lib/channels";

import { channelTraits, DEFAULT_CONNECTIONS } from "./channel-traits";

describe("channel definition table", () => {
  it("DEFAULT_CONNECTIONS covers exactly the registry channels", () => {
    expect(new Set(Object.keys(DEFAULT_CONNECTIONS))).toEqual(
      new Set(Object.keys(CHANNEL_REGISTRY)),
    );
  });

  it("each placeholder is that row's defaultConnection keyed by its channel", () => {
    for (const [channel, connection] of Object.entries(DEFAULT_CONNECTIONS)) {
      expect(connection.channel).toBe(channel);
      expect(connection).toBe(
        channelTraits(channel as keyof typeof DEFAULT_CONNECTIONS)
          .defaultConnection,
      );
    }
  });
});
