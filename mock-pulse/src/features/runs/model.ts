import type { EventDraft } from "@/features/events";
import type { ChannelId } from "@/lib/channels";
import type { DispatchOutcome } from "./api";

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
  /** 发出的明文载荷快照（逐字节与发送一致） */
  payload: string;
  /** 签名头快照（X-Douyin-Signature） */
  signature: string;
  /** Msg-Id 头快照 */
  msgId: string;
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

/** 直发 = 单步运行记录：载荷、签名头与回执全部落快照。 */
export function buildDirectRun(input: {
  draft: EventDraft;
  url: string;
  body: string;
  outcome: DispatchOutcome;
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
        receipt: {
          status: outcome.status,
          elapsedMs: outcome.elapsedMs,
          body: outcome.body,
          error: outcome.error,
        },
        verdict,
      },
    ],
  };
}
