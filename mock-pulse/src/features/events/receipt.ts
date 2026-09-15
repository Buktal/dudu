import type { ExpectedReceipt, ReceiptBodyMode } from "./model";

/**
 * 期望回执的展示辅助：编辑器形态选项 + 人类可读描述。
 * 比对语义的唯一实现收拢在 Rust（src-tauri/src/runs/verdict.rs）——
 * 直发命令与执行器共用同一份判定（ADR-0001 高保真），前端不再镜像比较逻辑。
 */

/** 编辑 UI 的形态选项（顺序即展示序） */
export const RECEIPT_BODY_MODES: readonly {
  id: ReceiptBodyMode;
  label: string;
  hint: string;
}[] = [
  {
    id: "contains",
    label: "包含",
    hint: "回执正文包含这段文本即通过。",
  },
  {
    id: "equals",
    label: "完全一致",
    hint: "回执正文与这段文本逐字相等才通过。",
  },
  {
    id: "jsonField",
    label: "JSON 字段",
    hint: "期望正文按 JSON 解析：其中每个字段（含嵌套）需在回执同路径出现且值相等；回执可以有额外字段。",
  },
  {
    id: "wecomReply",
    label: "微信系回执",
    hint: "按微信系官方三种回执形态比对（企微/公众号同语义）：期望留空 = 回执必须是空串；填 success = 逐字相等（不带引号）；填其他内容 = 目标须回加密被动回复，且解密明文包含该片段。",
  },
  {
    id: "dingtalkReply",
    label: "钉钉加密回包",
    hint: "按钉钉官方应答比对（事件推送 1500ms 窗口）：目标须回可验签解密的加密回包 {msg_signature,timeStamp,nonce,encrypt}，且解密明文包含期望内容（默认 success）。",
  },
];

/** 展示用：一段文本截断（避免长正文撑爆原因行） */
function clip(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

const MODE_LABEL: Record<ReceiptBodyMode, string> = {
  contains: "正文包含",
  equals: "正文完全一致",
  jsonField: "正文含 JSON 字段",
  wecomReply: "微信系回执形态",
  dingtalkReply: "钉钉加密回包（解密明文包含）",
};

/** 期望的人类可读描述（回执面板/运行记录展示用） */
export function describeExpected(expected: ExpectedReceipt): string {
  if (expected.body === "" && expected.bodyMode !== "wecomReply") {
    return `期望 HTTP ${expected.status}，不校验正文`;
  }
  if (expected.bodyMode === "dingtalkReply") {
    return `期望 HTTP ${expected.status}，加密回包解密明文包含「${clip(expected.body)}」（1500ms 窗口）`;
  }
  if (expected.bodyMode === "wecomReply" && expected.body === "") {
    return `期望 HTTP ${expected.status}，微信系回执为空串`;
  }
  if (expected.bodyMode === "wecomReply") {
    return `期望 HTTP ${expected.status}，微信系${
      expected.body === "success" ? "回执为 success" : "解密被动回复包含"
    }「${clip(expected.body)}」`;
  }
  return `期望 HTTP ${expected.status}，${MODE_LABEL[expected.bodyMode]}「${clip(expected.body)}」`;
}
