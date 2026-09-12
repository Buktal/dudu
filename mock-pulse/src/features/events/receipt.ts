import type { ExpectedReceipt, ReceiptBodyMode } from "./model";

/**
 * 期望回执比对（纯函数）：直发/运行拿到回执后，与事件设置的期望对照。
 * 只看 HTTP 状态码 + 回执正文形态，不涉及网络与时间。
 */

/** 实际回执事实：status 0 = 未收到响应（超时/连接失败） */
export type ReceiptFact = {
  status: number;
  body: string;
  /** 企微加密被动回复解密后的明文（目标未回加密包时为 null） */
  reply?: string | null;
};

export type ReceiptVerdict = {
  passed: boolean;
  reason: string;
};

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
    label: "企微回执",
    hint: "按企微官方三种回执形态比对：期望留空 = 回执必须是空串；填 success = 逐字相等（不带引号）；填其他内容 = 目标须回加密被动回复，且解密明文包含该片段。",
  },
];

/** 展示用：一段文本截断（避免长正文撑爆原因行） */
function clip(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function preview(value: unknown): string {
  return clip(
    typeof value === "string" ? value : (JSON.stringify(value) ?? "null"),
  );
}

function statusLabel(status: number): string {
  return status === 0 ? "未收到响应" : `HTTP ${status}`;
}

/** jsonField 模式的子集匹配：expected 的每个叶子需在 actual 同路径值相等
 * （回执可有额外字段/元素）。缺失时下钻到最深叶子，原因路径更可读。
 * 返回第一处不匹配的描述；完全匹配返回 undefined。 */
function firstJsonMismatch(
  expected: unknown,
  actual: unknown,
  path: string,
): string | undefined {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length < expected.length) {
      return `${path || "正文"}：期望 ${preview(expected)}，实际 ${preview(actual)}`;
    }
    for (let i = 0; i < expected.length; i += 1) {
      const found = firstJsonMismatch(expected[i], actual[i], `${path}[${i}]`);
      if (found) return found;
    }
    return undefined;
  }
  if (expected != null && typeof expected === "object") {
    for (const [key, child] of Object.entries(expected)) {
      const childActual =
        actual != null && typeof actual === "object" && !Array.isArray(actual)
          ? (actual as Record<string, unknown>)[key]
          : undefined;
      const found = firstJsonMismatch(
        child,
        childActual,
        path ? `${path}.${key}` : key,
      );
      if (found) return found;
    }
    return undefined;
  }
  if (expected !== actual) {
    return `${path || "正文"}：期望 ${preview(expected)}，实际 ${preview(actual)}`;
  }
  return undefined;
}

function compareBody(
  expected: ExpectedReceipt,
  fact: ReceiptFact,
): ReceiptVerdict {
  const label = statusLabel(fact.status);
  if (expected.body === "" && expected.bodyMode !== "wecomReply") {
    return { passed: true, reason: `${label}，与期望状态一致` };
  }
  switch (expected.bodyMode) {
    case "equals":
      return fact.body === expected.body
        ? { passed: true, reason: `${label}，正文与期望逐字一致` }
        : { passed: false, reason: `${label}，正文与期望不一致` };
    case "wecomReply":
      return compareWecomReply(expected.body, fact, label);
    case "jsonField": {
      let expectedJson: unknown;
      try {
        expectedJson = JSON.parse(expected.body);
      } catch {
        return {
          passed: false,
          reason: "期望正文不是合法 JSON，无法按 JSON 字段比对",
        };
      }
      let actualJson: unknown;
      try {
        actualJson = JSON.parse(fact.body);
      } catch {
        return {
          passed: false,
          reason: "回执正文不是合法 JSON，无法按 JSON 字段比对",
        };
      }
      const mismatch = firstJsonMismatch(expectedJson, actualJson, "");
      return mismatch
        ? { passed: false, reason: `${label}，${mismatch}` }
        : { passed: true, reason: `${label}，回执包含期望的全部 JSON 字段` };
    }
    default:
      return fact.body.includes(expected.body)
        ? {
            passed: true,
            reason: `${label}，正文包含「${clip(expected.body)}」`,
          }
        : {
            passed: false,
            reason: `${label}，正文未包含「${clip(expected.body)}」`,
          };
  }
}

/**
 * 企微回执三形态比对（官方 §3.3：空串 / success 不带引号 / 加密被动回复包）：
 * - 期望留空：回执正文必须恰为空串；
 * - 期望 success：逐字相等；
 * - 期望其他内容：回执须是加密被动回复（Rust 已解密为 reply 明文），
 *   且解密明文包含期望片段。
 */
function compareWecomReply(
  expectedBody: string,
  fact: ReceiptFact,
  label: string,
): ReceiptVerdict {
  if (expectedBody === "") {
    return fact.body === ""
      ? { passed: true, reason: `${label}，回执为空串` }
      : {
          passed: false,
          reason: `${label}，期望空串，实际「${clip(fact.body)}」`,
        };
  }
  if (expectedBody === "success") {
    return fact.body === "success"
      ? { passed: true, reason: `${label}，回执为 success（不带引号）` }
      : {
          passed: false,
          reason: `${label}，期望逐字 success，实际「${clip(fact.body)}」`,
        };
  }
  const reply = fact.reply;
  if (reply == null) {
    return {
      passed: false,
      reason: `${label}，期望加密被动回复，但目标未回可解密的加密包`,
    };
  }
  return reply.includes(expectedBody)
    ? {
        passed: true,
        reason: `${label}，解密被动回复包含「${clip(expectedBody)}」`,
      }
    : {
        passed: false,
        reason: `${label}，解密被动回复未包含「${clip(expectedBody)}」`,
      };
}

export function compareReceipt(
  expected: ExpectedReceipt,
  fact: ReceiptFact,
): ReceiptVerdict {
  if (fact.status !== expected.status) {
    return {
      passed: false,
      reason: `${statusLabel(fact.status)}，期望 HTTP ${expected.status}`,
    };
  }
  return compareBody(expected, fact);
}

const MODE_LABEL: Record<ReceiptBodyMode, string> = {
  contains: "正文包含",
  equals: "正文完全一致",
  jsonField: "正文含 JSON 字段",
  wecomReply: "企微回执形态",
};

/** 期望的人类可读描述（回执面板/运行记录展示用） */
export function describeExpected(expected: ExpectedReceipt): string {
  if (expected.body === "" && expected.bodyMode !== "wecomReply") {
    return `期望 HTTP ${expected.status}，不校验正文`;
  }
  if (expected.bodyMode === "wecomReply" && expected.body === "") {
    return `期望 HTTP ${expected.status}，企微回执为空串`;
  }
  if (expected.bodyMode === "wecomReply") {
    return `期望 HTTP ${expected.status}，企微${
      expected.body === "success" ? "回执为 success" : "解密被动回复包含"
    }「${clip(expected.body)}」`;
  }
  return `期望 HTTP ${expected.status}，${MODE_LABEL[expected.bodyMode]}「${clip(expected.body)}」`;
}
