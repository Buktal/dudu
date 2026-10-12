import { describe, expect, it } from "vitest";
import { requestDesk, requestDeskBlob } from "./desk-http";

describe("Desk HTTP boundary", () => {
  it("rejects an expired login even when the server returns HTTP 200", async () => {
    await expect(
      requestDesk({
        url: "https://desk.example.test/explicit-route",
        token: "expired-token",
        signal: new AbortController().signal,
        parse: (value) => value,
        fetcher: async () =>
          Response.json({ code: 10101, msg: "登录已过期", data: null }),
      }),
    ).rejects.toMatchObject({ kind: "authentication", code: 10101 });
  });

  it("distinguishes an uncertain network failure from a business rejection", async () => {
    await expect(
      requestDesk({
        url: "/explicit-send-route",
        token: "test-token",
        signal: new AbortController().signal,
        parse: (value) => value,
        fetcher: async () => {
          throw new TypeError("Failed to fetch");
        },
      }),
    ).rejects.toMatchObject({ kind: "network" });
  });

  it("reports cancellation separately when the request is aborted", async () => {
    const controller = new AbortController();
    const result = requestDesk({
      url: "/explicit-route",
      token: "test-token",
      signal: controller.signal,
      parse: (value) => value,
      fetcher: async () => {
        controller.abort();
        throw new DOMException("Aborted", "AbortError");
      },
    });
    await expect(result).rejects.toMatchObject({ kind: "aborted" });
  });

  it("rejects unreadable data and a response that fails the adapter parser", async () => {
    const base = {
      url: "/explicit-route",
      token: "test-token",
      signal: new AbortController().signal,
    };
    await expect(
      requestDesk({
        ...base,
        fetcher: async () => new Response("<html>Gateway error</html>"),
        parse: (value) => value,
      }),
    ).rejects.toMatchObject({ kind: "invalid-response" });
    await expect(
      requestDesk({
        ...base,
        fetcher: async () =>
          Response.json({ code: 0, msg: "ok", data: { wrong: true } }),
        parse: () => {
          throw new TypeError("missing required fields");
        },
      }),
    ).rejects.toMatchObject({ kind: "invalid-response" });
  });

  it("does not accept a transport failure as a successful response envelope", async () => {
    await expect(
      requestDesk({
        url: "/explicit-route",
        token: "test-token",
        signal: new AbortController().signal,
        parse: (value) => value,
        fetcher: async () =>
          Response.json({ code: 0, msg: "ok", data: {} }, { status: 503 }),
      }),
    ).rejects.toMatchObject({ kind: "network" });
  });

  it("only sends a bearer header for authenticated requests", async () => {
    await requestDesk({
      url: "/api/desk/login",
      method: "POST",
      body: { companyId: "783101", username: "boss", password: "password123" },
      signal: new AbortController().signal,
      parse: (value) => value,
      fetcher: async (_url, init) => {
        const headers = new Headers(init?.headers);
        expect(headers.has("Authorization")).toBe(false);
        expect(headers.get("Content-Type")).toBe("application/json");
        return Response.json({ code: 0, msg: "ok", data: { token: "issued" } });
      },
    });

    await requestDesk({
      url: "/api/desk/profile",
      token: "stored-token",
      signal: new AbortController().signal,
      parse: (value) => value,
      fetcher: async (_url, init) => {
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer stored-token",
        );
        return Response.json({ code: 0, msg: "ok", data: {} });
      },
    });
  });

  it("keeps the caller's route, bearer token and parser at the API boundary", async () => {
    const controller = new AbortController();
    const result = await requestDesk({
      url: "/caller-defined-route",
      token: "explicit-test-token",
      method: "POST",
      body: { value: 7 },
      signal: controller.signal,
      parse: (value) => {
        if (!value || typeof value !== "object" || !("result" in value)) {
          throw new TypeError("Invalid payload");
        }
        return value.result;
      },
      fetcher: async (url, init) => {
        expect(url).toBe("/caller-defined-route");
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer explicit-test-token",
        );
        expect(init?.body).toBe('{"value":7}');
        expect(init?.signal).toBe(controller.signal);
        return Response.json({
          code: 0,
          msg: "ok",
          data: { result: "accepted" },
        });
      },
    });
    expect(result).toBe("accepted");
  });

  it("preserves a business refusal code instead of inferring success from HTTP", async () => {
    await expect(
      requestDesk({
        url: "/caller-defined-send-route",
        token: "test-token",
        signal: new AbortController().signal,
        parse: (value) => value,
        fetcher: async () =>
          Response.json({ code: 14001, msg: "渠道拒绝了本次回复", data: null }),
      }),
    ).rejects.toMatchObject({ kind: "business", code: 14001 });
  });
});

describe("Desk media byte boundary", () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);

  it("returns the response bytes as a blob and keeps the token in the header", async () => {
    const blob = await requestDeskBlob({
      url: "https://desk.example.test/api/desk/messages/9001/media?index=1",
      token: "stored-token",
      signal: new AbortController().signal,
      fetcher: async (url, init) => {
        expect(String(url)).toBe(
          "https://desk.example.test/api/desk/messages/9001/media?index=1",
        );
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer stored-token",
        );
        return new Response(bytes, {
          headers: { "Content-Type": "image/jpeg" },
        });
      },
    });

    expect(blob.type).toBe("image/jpeg");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  });

  it("maps a JSON R error body to the same business semantics as JSON requests", async () => {
    await expect(
      requestDeskBlob({
        url: "/api/desk/messages/9001/media?index=2",
        token: "stored-token",
        signal: new AbortController().signal,
        fetcher: async () =>
          Response.json(
            { code: 12100, msg: "该消息没有这个媒体", data: null },
            { status: 200 },
          ),
      }),
    ).rejects.toMatchObject({
      kind: "business",
      code: 12100,
      message: "该消息没有这个媒体",
    });

    // 成功信封不是媒体字节：如实报无效响应，不把它当素材展示
    await expect(
      requestDeskBlob({
        url: "/api/desk/messages/9001/media",
        token: "stored-token",
        signal: new AbortController().signal,
        fetcher: async () => Response.json({ code: 0, msg: "ok", data: null }),
      }),
    ).rejects.toMatchObject({ kind: "invalid-response" });
  });

  it("keeps network and cancellation failures apart from channel errors", async () => {
    await expect(
      requestDeskBlob({
        url: "/api/desk/messages/9001/media",
        token: "stored-token",
        signal: new AbortController().signal,
        fetcher: async () => {
          throw new TypeError("Failed to fetch");
        },
      }),
    ).rejects.toMatchObject({ kind: "network" });

    const controller = new AbortController();
    await expect(
      requestDeskBlob({
        url: "/api/desk/messages/9001/media",
        token: "stored-token",
        signal: controller.signal,
        fetcher: async () => {
          controller.abort();
          throw new DOMException("Aborted", "AbortError");
        },
      }),
    ).rejects.toMatchObject({ kind: "aborted" });
  });
});
