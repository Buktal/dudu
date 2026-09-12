import { invoke } from "@tauri-apps/api/core";

import type { ChannelId } from "@/lib/channels";

export type ConnectionConfig = {
  channel: ChannelId;
  /** 回调目标地址，事件与剧本共享 */
  url: string;
  clientKey: string;
  clientSecret: string;
};

export type TestOutcome = {
  ok: boolean;
  /** 成功/失败的人类可读原因 */
  message: string;
};

/** 读取本地持久化的全部连接（Rust 端存 JSON 文件） */
export function loadConnections(): Promise<ConnectionConfig[]> {
  return invoke<ConnectionConfig[]>("connections_load");
}

/** 保存单条连接（按 channel 覆盖），返回保存后的完整列表 */
export function saveConnection(
  config: ConnectionConfig,
): Promise<ConnectionConfig[]> {
  return invoke<ConnectionConfig[]>("connections_save", { config });
}

/** 按抖音 verify_webhook 协议向目标发起 challenge 握手 */
export function testDouyinConnection(
  config: ConnectionConfig,
): Promise<TestOutcome> {
  return invoke<TestOutcome>("connections_test_douyin", { config });
}
