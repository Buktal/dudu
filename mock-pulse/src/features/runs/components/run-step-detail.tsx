import { CodeBlock } from "@/components/code-block";
import { Notice } from "@/components/notice";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { describeExpected } from "@/features/events";
import { type RunStep, receiptStatusText } from "../model";
import { StatusBadge } from "./run-visualization";

function requestSnapshot(step: RunStep): string {
  if (step.channel === "wecom") {
    const separator = step.url.includes("?") ? "&" : "?";
    return `POST ${step.url}${separator}msg_signature=${encodeURIComponent(step.signature)}&timestamp=${step.timestamp ?? ""}&nonce=${encodeURIComponent(step.msgId)}\nContent-Type: text/xml\n\n${step.requestBody ?? "（旧记录未保存加密信封）"}\n\n加密前 XML：\n${step.payload}`;
  }
  if (step.channel === "qq") {
    // QQ：普通事件带 Ed25519 签名三头；op13 验证回调无签名头（msgId 快照 plain_token）
    const headers = step.signature
      ? `X-Signature-Ed25519: ${step.signature}\nX-Signature-Timestamp: ${step.timestamp ?? ""}`
      : `User-Agent: QQBot-Callback（op13 验证回调）\nX-Bot-Appid: <连接 AppID>`;
    return `POST ${step.url}\nContent-Type: application/json\n${headers}\n\n${step.payload}`;
  }
  return `POST ${step.url}\nContent-Type: application/json\nX-Douyin-Signature: ${step.signature}\nMsg-Id: ${step.msgId}\n\n${step.payload}`;
}

export function RunStepDetail({ step }: { step: RunStep }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <StepVerdictBadge step={step} />
        <Badge variant="outline">{receiptStatusText(step.receipt)}</Badge>
        <Badge variant="outline">{step.receipt.elapsedMs} ms</Badge>
      </div>
      <Notice variant={step.verdict.passed ? "default" : "destructive"}>
        <div className="flex flex-col gap-1">
          <p>{step.verdict.reason}</p>
          <p>
            {step.expected
              ? describeExpected(step.expected)
              : "旧记录未保存期望快照"}
          </p>
        </div>
      </Notice>
      <Tabs defaultValue="response">
        <TabsList variant="line" aria-label="运行快照内容">
          <TabsTrigger value="response">HTTP 回执</TabsTrigger>
          <TabsTrigger value="request">发送请求</TabsTrigger>
        </TabsList>
        <TabsContent value="response" className="pt-3">
          <CodeBlock
            title="响应正文"
            value={`${step.receipt.body || "（空响应正文）"}${step.receipt.error ? `\n\n错误：${step.receipt.error}` : ""}${step.receipt.reply ? `\n\n解密后的回复：\n${step.receipt.reply}` : ""}`}
          />
        </TabsContent>
        <TabsContent value="request" className="pt-3">
          <CodeBlock title="发送时的请求快照" value={requestSnapshot(step)} />
        </TabsContent>
      </Tabs>
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
