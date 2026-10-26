import { describe, expect, it } from "vitest";
import { isSettings } from "./api";

describe("翻译配置响应契约", () => {
  it("只接受完整配置形状", () => {
    const valid = {
      revision: 1,
      defaultService: null,
      services: [],
      providers: [
        {
          id: "openai",
          name: "模型",
          kind: "model",
          endpoint: "https://example.com/chat",
          unavailableReason: null,
          fields: [
            { key: "apiKey", label: "API Key", secret: true, required: true },
          ],
        },
      ],
    };
    expect(isSettings(valid)).toBe(true);
    expect(isSettings({ ...valid, providers: [{ id: "incomplete" }] })).toBe(
      false,
    );
    expect(
      isSettings({
        ...valid,
        services: [
          {
            id: "instance",
            name: "模型",
            provider: "openai",
            endpoint: "https://example.com",
            values: { apiKey: null },
          },
        ],
      }),
    ).toBe(false);
  });
});
