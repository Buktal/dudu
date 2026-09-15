import type { ConnectionConfig } from "../api";
import { channelTraitOrNull } from "../channel-traits";

/**
 * 「已配置」的内容判定：直发前置条件，发送入口与指引展示共用。
 * 条目存在不等于已配置——按渠道核必填集，缺一即视为未配置
 * （含初始默认占位连接、仅存 url 未存凭据的半成品）。
 * 通用判定只保留两条公共规则：url 是全渠道公共前置；渠道内必填集查
 * channel-traits 表（规则本体在 ../channel-readiness，code-review 退件：
 * 渠道 switch 级联收敛为数据表）。注册表外渠道（持久化文件混入怪数据）
 * 一律视为未配置，fail-safe 不静默套用任何渠道规则。
 */
export function isConnectionReady(
  config: ConnectionConfig | undefined,
): config is ConnectionConfig {
  if (!config) {
    return false;
  }
  const trait = channelTraitOrNull(config.channel);
  if (!trait) {
    // 运行时未知渠道一律视为未配置（新增渠道漏配必填集由 traits 表
    // satisfies 在编译期报错）
    return false;
  }
  return config.url.trim() !== "" && trait.credentialReady(config);
}
