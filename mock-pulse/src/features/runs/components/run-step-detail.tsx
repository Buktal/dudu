import { describeExpected } from "@/features/events";
import { type RunStep, receiptStatusText } from "../model";
import { StatusBadge } from "./run-visualization";

function requestSnapshot(step: RunStep): string {
  if (step.channel === "wecom") {
    const separator = step.url.includes("?") ? "&" : "?";
    return `POST ${step.url}${separator}msg_signature=${encodeURIComponent(step.signature)}&timestamp=${step.timestamp ?? ""}&nonce=${encodeURIComponent(step.msgId)}\nContent-Type: text/xml\n\n${step.requestBody ?? "（旧记录未保存加密信封）"}\n\n加密前 XML：\n${step.payload}`;
  }
  return `POST ${step.url}\nContent-Type: application/json\nX-Douyin-Signature: ${step.signature}\nMsg-Id: ${step.msgId}\n\n${step.payload}`;
}

export function RunStepDetail({ step }: { step: RunStep }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <span className="mb-2 text-xs font-medium text-muted-foreground">
          发送时的请求快照
        </span>
        <pre className="max-h-72 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere">
          {requestSnapshot(step)}
        </pre>
      </div>
      <div>
        <span className="mb-2 text-xs font-medium text-muted-foreground">
          HTTP 回执
        </span>
        <pre className="max-h-72 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere">{`${receiptStatusText(step.receipt)}\n${step.receipt.body || "（空响应正文）"}${step.receipt.reply ? `\n\n解密后的回复：\n${step.receipt.reply}` : ""}`}</pre>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {step.verdict.passed ? "符合期望" : "与期望不符"} ·{" "}
          {step.verdict.reason}
          <br />
          {step.expected
            ? describeExpected(step.expected)
            : "旧记录未保存期望快照"}
        </p>
      </div>
    </div>
  );
}

export function StepVerdictBadge({ step }: { step: RunStep }) {
  return (
    <StatusBadge
      status={
        step.skipped ? "skipped" : step.verdict.passed ? "success" : "failed"
      }
    />
  );
}
