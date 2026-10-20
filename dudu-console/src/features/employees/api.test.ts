import { describe, expect, it } from "vitest";
import { isEmployee } from "./api";

const employee = {
  userId: "12",
  username: "alice",
  name: "Alice",
  role: "user",
  status: 1,
  isInitialAdmin: false,
  groupIds: ["3"],
  createTime: "2026-10-20 10:00:00",
  updateTime: "2026-10-20 10:00:00",
};
describe("employee response contract", () => {
  it("accepts safe details and rejects malformed identity and roles", () => {
    expect(isEmployee(employee)).toBe(true);
    expect(isEmployee({ ...employee, userId: 12 })).toBe(false);
    expect(isEmployee({ ...employee, role: "admin" })).toBe(false);
    expect(isEmployee({ ...employee, groupIds: [2] })).toBe(false);
  });
});
