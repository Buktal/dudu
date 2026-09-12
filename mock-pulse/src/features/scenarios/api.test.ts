import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";

import { deleteScenarioById, loadScenarios, saveScenario } from "./api";
import type { Scenario } from "./model";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

const scenario: Scenario = {
  id: "scn-001",
  name: "从进入到咨询",
  channelId: "douyin",
  steps: [
    { eventId: "evt-dy-1", revision: 1 },
    { eventId: "evt-dy-1", revision: 2 },
  ],
};

describe("scenarios api 契约", () => {
  it("loadScenarios 调用 scenarios_load 命令", async () => {
    invokeMock.mockResolvedValueOnce([scenario]);
    await expect(loadScenarios()).resolves.toEqual([scenario]);
    expect(invokeMock).toHaveBeenCalledWith("scenarios_load");
  });

  it("saveScenario 调用 scenarios_save 并透传 camelCase 剧本（步骤只含引用）", async () => {
    invokeMock.mockResolvedValueOnce([scenario]);
    await saveScenario(scenario);
    expect(invokeMock).toHaveBeenCalledWith("scenarios_save", { scenario });
  });

  it("deleteScenarioById 调用 scenarios_delete 并透传 scenarioId", async () => {
    invokeMock.mockResolvedValueOnce([]);
    await expect(deleteScenarioById("scn-001")).resolves.toEqual([]);
    expect(invokeMock).toHaveBeenCalledWith("scenarios_delete", {
      scenarioId: "scn-001",
    });
  });
});
