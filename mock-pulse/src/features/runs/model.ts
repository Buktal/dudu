import type { EventDraft } from "@/features/events";
import type { ChannelId } from "@/lib/channels";
import type { WecomDispatchOutcome } from "./api";

/**
 * 运行记录领域模型：一次运行 = 步骤快照数组。
 * 直发 = 单步 Run；剧本/编排运行在后续票扩展（source 增加 kinds）。
 * 快照不随来源事件修改而变化。
 */

/** 回执事实：status 0 = 未收到响应（超时/连接失败，原因在 error） */
export type ReceiptSnapshot = {
  status: number;
  elapsedMs: number;
  body: string;
  /** 企微加密被动回复解密后的明文（非企微渠道/未回加密包为空） */
  reply?: string | null;
  error: string | null;
};

/** 回执状态的展示文本（回执面板与运行记录视图共用单点） */
export function receiptStatusText(receipt: ReceiptSnapshot): string {
  return receipt.status === 0
    ? (receipt.error ?? "未收到响应")
    : `HTTP ${receipt.status}`;
}

export type RunVerdict = {
  passed: boolean;
  reason: string;
};

export type RunStep = {
  /** 来源事件的名称快照 */
  eventName: string;
  /** 来源事件 id（草稿未保存时也保留其 id） */
  eventId: string;
  channel: ChannelId;
  /** 发送目标地址快照 */
  url: string;
  /** 发出的明文载荷快照（逐字节与发送一致；企微为加密前的明文 XML） */
  payload: string;
  /** 签名快照：抖音 X-Douyin-Signature 头 / 企微 msg_signature 查询参数 */
  signature: string;
  /** 发送唯一标识快照：抖音 Msg-Id 头 / 企微 nonce */
  msgId: string;
  /** 企微 msg_signature 的 timestamp（秒级字符串；抖音为空） */
  timestamp?: string;
  receipt: ReceiptSnapshot;
  verdict: RunVerdict;
};

export type RunRecord = {
  id: string;
  /** 启动时间（ISO） */
  startedAt: string;
  /** direct = 事件直发 */
  source: "direct";
  steps: RunStep[];
};

let idCounter = 0;

export function newRunId(): string {
  idCounter += 1;
  return `run-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

/** 渠道直发结果的公共形态（抖音/企微命令返回值归一后落记录） */
export type SendOutcome = {
  signature: string;
  msgId: string;
  timestamp?: string;
  status: number;
  elapsedMs: number;
  body: string;
  reply?: string | null;
  error: string | null;
};

/** 企微命令返回值 → 公共形态（nonce 充当发送唯一标识快照） */
export function wecomSendOutcome(outcome: WecomDispatchOutcome): SendOutcome {
  return {
    signature: outcome.signature,
    msgId: outcome.nonce,
    timestamp: outcome.timestamp,
    status: outcome.status,
    elapsedMs: outcome.elapsedMs,
    body: outcome.body,
    reply: outcome.reply,
    error: outcome.error,
  };
}

/** 直发 = 单步运行记录：载荷、签名与回执全部落快照。
 *  outcome 为渠道命令返回值的公共形态（抖音 DispatchOutcome 结构可直传：
 *  timestamp/reply 为可选字段，缺省即 undefined）。 */
export function buildDirectRun(input: {
  draft: EventDraft;
  url: string;
  body: string;
  outcome: SendOutcome;
  verdict: RunVerdict;
  startedAt: string;
}): RunRecord {
  const { draft, url, body, outcome, verdict, startedAt } = input;
  return {
    id: newRunId(),
    startedAt,
    source: "direct",
    steps: [
      {
        eventName: draft.name,
        eventId: draft.id,
        channel: draft.channelId,
        url,
        payload: body,
        signature: outcome.signature,
        msgId: outcome.msgId,
        timestamp: outcome.timestamp,
        receipt: {
          status: outcome.status,
          elapsedMs: outcome.elapsedMs,
          body: outcome.body,
          reply: outcome.reply,
          error: outcome.error,
        },
        verdict,
      },
    ],
  };
}
