import { defineSchema } from "../define";
import {
  MINI_DEFINITIONS,
  MINI_EXPECTED,
  miniEventEnvelope,
  miniEventIdGenerations,
  miniMessageLayout,
} from "./shared";

/**
 * 小程序进入会话事件（事实库 §2.2 + §5.4 官方样本，逐字）：
 * 用户经「客服会话按钮」进入客服会话时推送。官方事件名为
 * user_enter_tempsession——线索中的 user_enter_session 在 primary 中不存在
 * （2026-09-10 复核直抓 receive.html 全页证伪），事件名拼写逐字锚定。
 */
export const MINI_EVENT_SCHEMAS = [
  defineSchema(MINI_DEFINITIONS, "wmn-enter-tempsession", {
    eventName: "user_enter_tempsession",
    name: "进入客服会话",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: MINI_EXPECTED,
    xmlLayout: miniMessageLayout,
    idGenerations: miniEventIdGenerations(),
    // 官方样本 §5.4（JSON 逐字，XML 同构）
    payload: miniEventEnvelope("user_enter_tempsession", {
      SessionFrom: "sessionFrom",
    }),
  }),
] as const;
