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
  if (step.channel === "weibo") {
    // 微博：三参签名走 URL query（官方每次推送同样验签；msgId 快照 nonce）
    const separator = step.url.includes("?") ? "&" : "?";
    return `POST ${step.url}${separator}signature=${step.signature}&timestamp=${step.timestamp ?? ""}&nonce=${step.msgId}\nContent-Type: application/json\n\n${step.payload}`;
  }
  if (step.channel === "xiaohongshu") {
    // 小红书：小程序通道 body 即加密信封 {Nonce,Timestamp,Encrypt,MsgSignature}
    // （签名在 body 内，签名快照即 MsgSignature）；ark 通道 body 为官方批量
    // 数组（payload 为单条信封，数组包裹见 requestBody 快照）
    return `POST ${step.url}\nContent-Type: application/json\n\n${step.requestBody ?? step.payload}${step.payload && step.requestBody && step.requestBody !== step.payload ? `\n\n加密/包裹前明文：\n${step.payload}` : ""}`;
  }
  if (step.channel === "kuaishou") {
    // 快手：验签在 header（kwaisign = MD5(原始 body + AppSecret)，无 AES），
    // body 即明文 JSON 逐字节透传；message_id 幂等键在载荷内（msgId 快照即它）
    return `POST ${step.url}\nContent-Type: application/json\nkwaisign: ${step.signature}\n\n${step.payload}`;
  }
  if (step.channel === "taobao") {
    // 淘宝（全球栈）：验签在 header（Authorization = HEX(HMAC-SHA256(AppKey+body,
    // AppSecret))，数据明文传输）；body 即明文 JSON 逐字节透传，msgId 快照取
    // tid/refund_id/msg_id 等业务幂等键
    return `POST ${step.url}\nContent-Type: application/json\nAuthorization: ${step.signature}\n\n${step.payload}`;
  }
  if (step.channel === "jingdong") {
    // 京东（JOS）：系统参数走 URL query（app_key/timestamp(yyyy-MM-dd HH:mm:ss，
    // 10 分钟窗)/v=2.0 + sign = UPPER(MD5(appSecret+字母序 k+v+appSecret))，
    // 应用级参数 360buy_param_json 即 body 明文同值参与签名）；msgId 快照取
    // 载荷业务单号（order_id/serviceId）
    const separator = step.url.includes("?") ? "&" : "?";
    return `POST ${step.url}${separator}app_key=<连接 AppKey>&timestamp=${encodeURIComponent(step.timestamp ?? "")}&v=2.0&sign=${step.signature}\nContent-Type: application/json\n\n${step.payload}`;
  }
  if (step.channel === "pinduoduo") {
    // 拼多多（PMC 订阅推送）：公共参数走 URL query（client_id/timestamp
    // （UNIX 秒）+ sign = UPPER(MD5(client_secret+ASCII 排序 k+v+client_secret))，
    // 覆盖 query 公共参数与 body 明文顶层 kv）；msgId 快照取载荷订单号
    const separator = step.url.includes("?") ? "&" : "?";
    return `POST ${step.url}${separator}client_id=<连接 ClientID>&timestamp=${encodeURIComponent(step.timestamp ?? "")}&sign=${step.signature}\nContent-Type: application/json\n\n${step.payload}`;
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
