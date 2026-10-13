import { describe, expect, it } from "vitest";
import { unavailableAccountApi } from "./api";
import { loadAccountApi } from "./runtime";

describe("account runtime", () => {
  it("loads the real server adapter", async () => {
    const api = await loadAccountApi();
    expect(api).not.toBe(unavailableAccountApi);
  });

  it("returns no session when signed out, without a request or a fake identity", async () => {
    const api = await loadAccountApi();
    // 未登录时既不发请求也不给出虚假身份
    expect(await api.getSession(new AbortController().signal)).toBeNull();
  });
});
