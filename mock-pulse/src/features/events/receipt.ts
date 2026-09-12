import type { ExpectedReceipt, ReceiptBodyMode } from "./model";

/**
 * 期望回执比对（纯函数）：直发/运行拿到回执后，与事件设置的期望对照。
 * 只看 HTTP 状态码 + 回执正文形态，不涉及网络与时间。
 */

/** 实际回执事实：status 0 = 未收到响应（超时/连接失败） */
export type ReceiptFact = {
  status: number;
  body: string;
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
  if (expected.body === "") {
    return { passed: true, reason: `${label}，与期望状态一致` };
  }
  switch (expected.bodyMode) {
    case "equals":
      return fact.body === expected.body
        ? { passed: true, reason: `${label}，正文与期望逐字一致` }
        : { passed: false, reason: `${label}，正文与期望不一致` };
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
};

/** 期望的人类可读描述（回执面板/运行记录展示用） */
export function describeExpected(expected: ExpectedReceipt): string {
  if (expected.body === "") {
    return `期望 HTTP ${expected.status}，不校验正文`;
  }
  return `期望 HTTP ${expected.status}，${MODE_LABEL[expected.bodyMode]}「${clip(expected.body)}」`;
}
