import { describe, expect, it } from "vitest";
import { parseRoute, routes } from "@/navigation";

describe("routes -> parseRoute", () => {
  it("round-trips companyDetail", () => {
    expect(parseRoute(`#/${routes.companyDetail("123456")}`)).toEqual({
      view: "companies",
      selectedId: "123456",
      creating: false,
    });
  });

  it("encodes companyId so it stays one param", () => {
    const hash = `#/${routes.companyDetail("123&create=1")}`;
    expect(hash).toBe("#/companies?companyId=123%26create%3D1");
    expect(parseRoute(hash)).toEqual({
      view: "companies",
      selectedId: null,
      creating: false,
    });
  });

  it("round-trips companyCreate", () => {
    expect(parseRoute(`#/${routes.companyCreate()}`)).toEqual({
      view: "companies",
      selectedId: null,
      creating: true,
    });
  });

  it("companies is the clear-params close target", () => {
    expect(parseRoute(`#/${routes.companies()}`)).toEqual({
      view: "companies",
      selectedId: null,
      creating: false,
    });
  });

  it("round-trips resources", () => {
    expect(parseRoute(`#/${routes.resources("123456")}`)).toEqual({
      view: "resources",
      selectedId: "123456",
      creating: false,
    });
  });

  it("round-trips overview", () => {
    expect(parseRoute(`#/${routes.overview()}`).view).toBe("overview");
  });
});
