import { defineSchema } from "../define";
import {
  WECOM_DEFINITIONS,
  WECOM_EXPECTED,
  wcCdataEventLayout,
  wcEventIdGenerations,
  wcSysEnvelope,
} from "./shared";

/**
 * 企微事件字典 · 上下游变更（事实库 §2.8，95796）：
 * Event=change_chain，FromUserName=sys，变更类型 9 种全量覆盖。
 * corp_join 有官方 §5.8 原文（ChainId/CorpIds；原文 `![CDATA[` 缺 `<` 为官方
 * 笔误，按事实库建议修正为标准 CDATA——残缺 CDATA 无法过本应用自身解析）；
 * 其余 8 种官方未收录字段明细，载荷仅 ChangeType，经完整报文页增补。
 */

/** §5.8 原文片段：CorpIds 结构体（笔误 CDATA 已修正，排版照原文 tab 缩进） */
const CORP_IDS = [
  "<CorpIds>",
  "\t\t<CorpId><![CDATA[xxxxxx]]></CorpId>",
  "\t\t<CorpId><![CDATA[xxxxxx]]></CorpId>",
  "\t</CorpIds>",
].join("\n");

export const WECOM_AGENT_CHAIN_EVENT_SCHEMAS = [
  defineSchema(WECOM_DEFINITIONS, "wc-chain-corp-join", {
    eventName: "change_chain",
    name: "上下游 · 企业加入",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcCdataEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_chain", "corp_join", {
      ChainId: "xxxxxx",
      CorpIds: CORP_IDS,
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-chain-create-chain", {
    eventName: "change_chain",
    name: "上下游 · 创建空间",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcCdataEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_chain", "create_chain"),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-chain-update-chain", {
    eventName: "change_chain",
    name: "上下游 · 变更空间",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcCdataEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_chain", "update_chain"),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-chain-delete-chain", {
    eventName: "change_chain",
    name: "上下游 · 删除空间",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcCdataEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_chain", "delete_chain"),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-chain-create-group", {
    eventName: "change_chain",
    name: "上下游 · 创建企业分组",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcCdataEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_chain", "create_group"),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-chain-update-group", {
    eventName: "change_chain",
    name: "上下游 · 变更企业分组",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcCdataEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_chain", "update_group"),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-chain-delete-group", {
    eventName: "change_chain",
    name: "上下游 · 删除企业分组",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcCdataEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_chain", "delete_group"),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-chain-remove-corp", {
    eventName: "change_chain",
    name: "上下游 · 移除企业",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcCdataEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_chain", "remove_corp"),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-chain-update-corp", {
    eventName: "change_chain",
    name: "上下游 · 变更企业分组归属",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcCdataEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_chain", "update_corp"),
  }),
] as const;
