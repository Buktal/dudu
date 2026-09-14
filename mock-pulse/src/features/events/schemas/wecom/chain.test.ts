import { describe, expect, it } from "vitest";

import { schemaById } from "../registry";
import { WECOM_AGENT_CHAIN_EVENT_SCHEMAS } from "./chain";

describe("企微事件字典 · 上下游变更", () => {
  it("提供 change_chain 全部 9 个变更类型模板", () => {
    expect(WECOM_AGENT_CHAIN_EVENT_SCHEMAS.map((schema) => schema.id)).toEqual([
      "wc-chain-corp-join",
      "wc-chain-create-chain",
      "wc-chain-update-chain",
      "wc-chain-delete-chain",
      "wc-chain-create-group",
      "wc-chain-update-group",
      "wc-chain-delete-group",
      "wc-chain-remove-corp",
      "wc-chain-update-corp",
    ]);
    for (const schema of WECOM_AGENT_CHAIN_EVENT_SCHEMAS) {
      expect(schema.eventName).toBe("change_chain");
      expect(schema.payload.FromUserName).toBe("sys");
    }
  });

  it("corp_join 按 §5.8 原文，笔误 CDATA 按官方建议修正为标准形态", () => {
    const schema = schemaById("wc-chain-corp-join");
    expect(schema.payload.ChainId).toBe("xxxxxx");
    expect(schema.payload.CorpIds).toEqual(
      [
        "<CorpIds>",
        "\t\t<CorpId><![CDATA[xxxxxx]]></CorpId>",
        "\t\t<CorpId><![CDATA[xxxxxx]]></CorpId>",
        "\t</CorpIds>",
      ].join("\n"),
    );
    // 嵌套结构体不进描述文件已知字段（XML 已知元素必须纯文本）
    expect(schema.fields.some((field) => field.path === "CorpIds")).toBe(false);
    expect(schema.fields.some((field) => field.path === "ChainId")).toBe(true);
  });

  it("其余 8 个变更类型按事实库极简（仅 ChangeType，无编造字段）", () => {
    for (const id of [
      "wc-chain-create-chain",
      "wc-chain-update-chain",
      "wc-chain-delete-chain",
      "wc-chain-create-group",
      "wc-chain-update-group",
      "wc-chain-delete-group",
      "wc-chain-remove-corp",
      "wc-chain-update-corp",
    ]) {
      expect(Object.keys(schemaById(id).payload), id).toHaveLength(6);
    }
  });
});
