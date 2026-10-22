import { describe, expect, it } from "vitest";
import { href, parseRoute, routes } from "@/navigation";

describe("routes -> parseRoute", () => {
  it("round-trips employees detail", () => {
    expect(parseRoute(`#/${routes.employees("12")}`)).toEqual({
      view: "employees",
      selectedId: "12",
      creating: false,
      groupId: null,
    });
  });

  it("encodes userId so it stays one param", () => {
    const hash = `#/${routes.employees("12&create=1")}`;
    expect(hash).toBe("#/employees?userId=12%26create%3D1");
    expect(parseRoute(hash)).toEqual({
      view: "employees",
      selectedId: null,
      creating: false,
      groupId: null,
    });
  });

  it("round-trips userGroups and echoes groupId", () => {
    expect(parseRoute(`#/${routes.userGroups("8")}`)).toEqual({
      view: "user-groups",
      selectedId: "8",
      creating: false,
      groupId: "8",
    });
  });

  it("round-trips channelAccounts with accountId and groupId", () => {
    expect(parseRoute(`#/${routes.channelAccounts("3", "8")}`)).toEqual({
      view: "channel-accounts",
      selectedId: "3",
      creating: false,
      groupId: "8",
    });
  });

  it("round-trips channelCreate with group seed", () => {
    expect(parseRoute(`#/${routes.channelCreate("8")}`)).toEqual({
      view: "channel-accounts",
      selectedId: null,
      creating: true,
      groupId: "8",
    });
  });

  it("plain list is the clear-params close target", () => {
    expect(parseRoute(`#/${routes.userGroups()}`)).toEqual({
      view: "user-groups",
      selectedId: null,
      creating: false,
      groupId: null,
    });
  });

  it("rejects malformed ids and unknown views fall back to login", () => {
    expect(parseRoute("#/employees?userId=abc").selectedId).toBeNull();
    expect(parseRoute("#/nowhere").view).toBe("login");
  });
});

describe("href", () => {
  it("prefixes the hash route with #/", () => {
    expect(href(routes.account())).toBe("#/account");
    expect(href(routes.employees("12"))).toBe("#/employees?userId=12");
  });
});
