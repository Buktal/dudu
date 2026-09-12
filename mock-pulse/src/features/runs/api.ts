import { invoke } from "@tauri-apps/api/core";

import type {
  DouyinConnectionConfig,
  WecomConnectionConfig,
} from "@/features/connections";
import type { RunRecord } from "./model";

/** 抖音直发的回执（Rust sends_dispatch_douyin 返回，camelCase） */
export type DispatchOutcome = {
  msgId: string;
  signature: string;
  /** 0 = 未收到响应（超时/连接失败） */
  status: number;
  elapsedMs: number;
  body: string;
  error: string | null;
};

/** 企微直发的回执（Rust sends_dispatch_wecom 返回，camelCase） */
export type WecomDispatchOutcome = {
  /** msg_signature 查询参数（token/timestamp/nonce/密文 四值字典序 sha1） */
  signature: string;
  /** 参与签名的时间戳（秒级字符串） */
  timestamp: string;
  /** 参与签名的随机串（一次发送的唯一标识） */
  nonce: string;
  /** 0 = 未收到响应（超时/连接失败） */
  status: number;
  elapsedMs: number;
  /** 原始回执文本：空串 / success / 加密被动回复包 */
  body: string;
  /** 加密被动回复解密后的明文（目标未回加密包时为 null） */
  reply: string | null;
  error: string | null;
};

/** 读取本地持久化的全部运行记录（Rust 端 runs.json，时间升序） */
export function loadRuns(): Promise<RunRecord[]> {
  return invoke<RunRecord[]>("runs_load");
}

/** 追加一条运行记录，返回保存后的完整列表 */
export function saveRun(run: RunRecord): Promise<RunRecord[]> {
  return invoke<RunRecord[]>("runs_save", { run });
}

/**
 * 抖音直发：把前端逐字节拼装的明文交给 Rust 签名（X-Douyin-Signature、
 * Msg-Id）并真实 POST 到连接配置的目标地址；字节透传不重排。
 */
export function dispatchDouyin(
  config: DouyinConnectionConfig,
  body: string,
): Promise<DispatchOutcome> {
  return invoke<DispatchOutcome>("sends_dispatch_douyin", { config, body });
}

/**
 * 企微直发：把前端确定性拼装的明文 XML 交给 Rust 加密成官方信封
 * （外层 ToUserName/Encrypt/AgentID + msg_signature 查询参数），
 * 以 text/xml POST 到目标地址；回执按企微语义解密被动回复。
 */
export function dispatchWecom(
  config: WecomConnectionConfig,
  body: string,
): Promise<WecomDispatchOutcome> {
  return invoke<WecomDispatchOutcome>("sends_dispatch_wecom", {
    config,
    body,
  });
}
