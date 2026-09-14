import type { ExpectedReceipt } from "@/features/events";
import type { ChannelId } from "@/lib/channels";

/**
 * 运行记录领域模型：一次运行 = 步骤快照数组。
 * 直发 = 单步 Run；剧本运行 = 多步 Run（失败即停，后续步骤 skipped）。
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
  requestBody?: string | null;
  expected?: ExpectedReceipt | null;
  /** 签名快照：抖音 X-Douyin-Signature 头 / 企微 msg_signature 查询参数 */
  signature: string;
  /** 发送唯一标识快照：抖音 Msg-Id 头 / 企微 nonce */
  msgId: string;
  /** 企微 msg_signature 的 timestamp（秒级字符串；抖音为空） */
  timestamp?: string;
  receipt: ReceiptSnapshot;
  verdict: RunVerdict;
  /** 剧本运行失败即停：失败步之后未发送的步骤（旧记录缺省 false） */
  skipped?: boolean;
  /** 编排运行：本步骤所属 lane 序号（直发/剧本运行/旧记录缺省为空） */
  laneIndex?: number | null;
  /** 编排运行：本步骤所属剧本名快照（直发/剧本运行/旧记录缺省为空） */
  laneName?: string | null;
};

export type RunRecord = {
  id: string;
  /** 启动时间（ISO） */
  startedAt: string;
  /** direct = 事件直发；scenario = 剧本运行；plan = 执行编排 */
  source: "direct" | "scenario" | "plan";
  /** 来源剧本名快照（直发记录/旧记录为空） */
  scenarioName?: string | null;
  /** 来源编排名快照（编排运行记录才有） */
  planName?: string | null;
  steps: RunStep[];
  mode?: "serial" | "parallel" | null;
  sourceId?: string | null;
  cancelled?: boolean;
};

let idCounter = 0;

export function newRunId(): string {
  idCounter += 1;
  return `run-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

/** 直发 = 单步运行记录：Rust 直发命令已产出成品步骤快照，这里只补运行信封 */
export function directRunRecord(input: {
  runId: string;
  startedAt: string;
  cancelled: boolean;
  step: RunStep;
}): RunRecord {
  return {
    id: input.runId,
    startedAt: input.startedAt,
    source: "direct",
    sourceId: input.step.eventId,
    cancelled: input.cancelled,
    steps: [input.step],
  };
}
