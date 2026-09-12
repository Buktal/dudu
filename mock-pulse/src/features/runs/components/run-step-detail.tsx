import { CheckCircle2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { type RunStep, receiptStatusText } from "../model";

/** 明文载荷的展示形态：JSON 能解析则 2 空格缩进；XML/其余原样展示 */
function prettyPayload(payload: string): string {
  try {
    return `${JSON.stringify(JSON.parse(payload), null, 2)}`;
  } catch {
    return payload;
  }
}

/** 企微回执：原始回执 + 加密被动回复的解密明文（有解密明文时一并展示） */
function receiptBody(step: RunStep): string {
  const head = step.receipt.body || "（空响应正文）";
  if (!step.receipt.reply) {
    return head;
  }
  return `${head}\n\n—— 解密被动回复明文 ——\n${step.receipt.reply}`;
}

/** 发送请求快照：抖音 = 签名头 JSON POST；企微 = msg_signature 查询参数 text/xml POST */
function requestSnapshot(step: RunStep): string {
  if (step.channel === "wecom") {
    const query = `msg_signature=${step.signature}&timestamp=${step.timestamp ?? ""}&nonce=${step.msgId}`;
    return `POST ${step.url}?${query}\nContent-Type: text/xml\n\n${prettyPayload(step.payload)}`;
  }
  return `POST ${step.url}\nContent-Type: application/json\nX-Douyin-Signature: ${step.signature}\nMsg-Id: ${step.msgId}\n\n${prettyPayload(step.payload)}`;
}

/**
 * 步骤快照详情：发送时的请求（地址/签名/载荷）与回执（状态/原文/结论）。
 * 回执面板与运行记录视图共用；数据全部来自快照，不随来源事件变化。
 */
export function RunStepDetail({ step }: { step: RunStep }) {
  const passed = step.verdict.passed;
  return (
    <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      <div className="min-w-0 space-y-1.5">
        <span className="text-[10px] text-muted-foreground">
          发送时的请求快照
        </span>
        <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[10px] leading-relaxed text-foreground">
          {requestSnapshot(step)}
        </pre>
      </div>
      <div className="min-w-0 space-y-1.5">
        <span className="text-[10px] text-muted-foreground">回执</span>
        <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[10px] leading-relaxed text-foreground">
          {`${receiptStatusText(step.receipt)}\n\n${receiptBody(step)}`}
        </pre>
        <p className="flex items-start gap-1.5 text-[10px] leading-relaxed">
          {passed ? (
            <CheckCircle2
              className="mt-0.5 size-3.5 shrink-0 text-success"
              aria-hidden
            />
          ) : (
            <XCircle
              className="mt-0.5 size-3.5 shrink-0 text-destructive"
              aria-hidden
            />
          )}
          <span className={cn(passed ? "text-success" : "text-destructive")}>
            {passed ? "符合期望" : "与期望不符"}
          </span>
          <span className="text-muted-foreground">
            · {step.verdict.reason} · {step.receipt.elapsedMs} ms
          </span>
        </p>
      </div>
    </div>
  );
}

/** 运行记录行的状态徽标 */
export function StepVerdictBadge({ step }: { step: RunStep }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-mono text-[9px]",
        step.verdict.passed
          ? "border-success/40 text-success"
          : "border-destructive/40 text-destructive",
      )}
    >
      {step.receipt.status === 0
        ? "未收到响应"
        : `${step.receipt.status} · ${step.receipt.elapsedMs}ms`}
    </Badge>
  );
}
