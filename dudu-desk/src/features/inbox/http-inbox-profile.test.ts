import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpInboxApi } from "./http-inbox-api";
import {
  CONTEXT,
  envelope,
  ORIGIN,
  seed,
  signal,
} from "./http-inbox-test-support";
import type { VisitorProfile } from "./types";

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

const SERVER_PROFILE = {
  conversationId: "41",
  version: 3,
  fields: [
    { label: "备注名", value: { state: "available", value: "张先生" } },
    { label: "手机", value: { state: "empty" } },
    { label: "公司", value: { state: "not-provided" } },
  ],
  tags: ["重点客户", "VIP"],
  note: "记得跟进\n已下单",
};

const EXPECTED_PROFILE: VisitorProfile = {
  conversationId: "41",
  version: 3,
  fields: [
    { label: "备注名", value: { state: "available", value: "张先生" } },
    { label: "手机", value: { state: "empty" } },
    { label: "公司", value: { state: "not-provided" } },
  ],
  tags: ["重点客户", "VIP"],
  note: "记得跟进\n已下单",
};

describe("http inbox profile adapter", () => {
  it("reads the shared profile with the stored token", async () => {
    seed("stored-token");
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toBe(`${ORIGIN}/api/desk/visitors/41/profile`);
      return envelope(SERVER_PROFILE);
    });
    const api = createHttpInboxApi({ origin: ORIGIN, fetcher });

    const profile = await api.readProfile({
      context: CONTEXT,
      signal: signal(),
      conversationId: "41",
    });

    expect(profile).toEqual(EXPECTED_PROFILE);
  });

  it("saves tags and note with the PUT profile contract", async () => {
    seed("stored-token");
    const fetcher = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        expect(String(url)).toBe(`${ORIGIN}/api/desk/visitors/41/profile`);
        expect(init?.method).toBe("PUT");
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer stored-token",
        );
        // 契约只接受标签与备注：版本号与服务端冲突判定不进入请求体
        expect(JSON.parse(String(init?.body))).toEqual({
          tags: ["重点客户", "VIP"],
          note: "记得跟进",
        });
        return envelope({
          ...SERVER_PROFILE,
          version: 4,
          note: "记得跟进",
        });
      },
    );
    const api = createHttpInboxApi({ origin: ORIGIN, fetcher });

    const saved = await api.saveProfile({
      context: CONTEXT,
      signal: signal(),
      conversationId: "41",
      tags: ["重点客户", "VIP"],
      note: "记得跟进",
      version: 3,
    });

    expect(saved).toEqual({
      ...EXPECTED_PROFILE,
      version: 4,
      note: "记得跟进",
    });
  });

  it("surfaces business failures and rejects a malformed profile instead of guessing", async () => {
    seed("stored-token");
    const refused = createHttpInboxApi({
      origin: ORIGIN,
      fetcher: async () =>
        Response.json({ code: 10106, msg: "无访问权限", data: null }),
    });
    await expect(
      refused.saveProfile({
        context: CONTEXT,
        signal: signal(),
        conversationId: "41",
        tags: [],
        note: "",
        version: 3,
      }),
    ).rejects.toMatchObject({ kind: "forbidden", code: 10106 });

    const malformed = createHttpInboxApi({
      origin: ORIGIN,
      fetcher: async () => envelope({ ...SERVER_PROFILE, tags: ["有效", 42] }),
    });
    await expect(
      malformed.readProfile({
        context: CONTEXT,
        signal: signal(),
        conversationId: "41",
      }),
    ).rejects.toMatchObject({ kind: "invalid-response" });
  });
});
