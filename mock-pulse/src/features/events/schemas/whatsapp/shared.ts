import {
  mergeChannelDefinitions,
  parseChannelDefinition,
} from "../../definitions/loader";
import inboundDefinitions from "../../definitions/whatsapp/whatsapp-inbound.json";
import managementDefinitions from "../../definitions/whatsapp/whatsapp-management.json";
import statusBasicDefinitions from "../../definitions/whatsapp/whatsapp-status-basic.json";
import statusDefinitions from "../../definitions/whatsapp/whatsapp-statuses.json";
import type { ExpectedReceipt, IdGeneration, WirePayload } from "../types";

/**
 * WhatsApp 渠道协议元数据公共体（事实库 docs/research/channels/whatsapp.md，
 * Cloud API Webhook——单 URL + 必订 messages）：
 * - 传输（§2/§4）：POST 明文 JSON（载荷不设加密字段，仅 HTTPS + 签名），
 *   头 X-Hub-Signature-256 = "sha256=" + hex(HMAC-SHA256(AppSecret, 原始
 *   body))——验签与 GET 三参握手由 Rust 适配器完成
 * - 模板四源：入站文本取 set-up-webhooks 页核验样本（§5.1 逐字），出站
 *   状态 delivered 取 status 参考页核验样本（§5.2 逐字），sent/read/failed
 *   按 §2.1 状态枚举与错误挂载口径构造（官方全量样本未给，占位注明），
 *   管理面 template/phone 取参考页核验样本（§5.4/§5.5 逐字），capability/
 *   account 按 §2.2 组件表字段名构造（载荷样本待核验(09-27)，占位注明）
 * - 应答（§3.3 逐字）：「端点回 HTTP 200 即成功；其他状态码或不可达即失败，
 *   Meta 以递减频率重试直到成功，最长 7 天」——应答正文无官方口径
 * - 载荷上限：Webhook payloads 可达 3MB（§3.3 已核验），模拟器不设限
 * 字段说明与版本/来源由 definitions/whatsapp/ 分域描述文件装载即校验后合并。
 */

/**
 * 版本化字段描述文件：按域分四份（入站 inbound / 状态 statuses——含会话与
 * 计费挂载的 delivered·sent / 状态基础形态 status-basic——read 无挂载·failed
 * 错误挂载 / 管理面 management），装载即校验（坏文件启动即炸）后合并。
 */
export const WA_DEFINITIONS = mergeChannelDefinitions(
  [
    inboundDefinitions,
    statusDefinitions,
    statusBasicDefinitions,
    managementDefinitions,
  ].map((part) => parseChannelDefinition(part)),
);

/**
 * 官方成功语义（§3.3 逐字）：「端点回 HTTP 200 即成功；其他状态码或不可达
 * 即失败，Meta 以递减频率重试直到成功，最长 7 天」——应答正文无官方口径
 * （GET 握手的 challenge 裸回属端点侧应答，不在期望回执内），空串 = 只看状态码。
 */
export const WA_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: "",
  bodyMode: "contains",
};

/**
 * messages 族回调信封骨架（§5.1/§5.2 官方键序：object 在前 entry 在后；
 * changes[].field 恒 messages）：value 与 WABA ID 由调用方覆写。
 */
export function waMessagesEnvelope(
  entryId: string,
  value: WirePayload,
): WirePayload {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: entryId, changes: [{ value, field: "messages" }] }],
  };
}

/**
 * 管理面回调信封骨架（§5.4/§5.5 官方键序：entry 在前、object 收尾，与
 * messages 族相反；entry[].time 为数字秒级、messages 族无 time）：
 * field/value 与 WABA ID 由调用方覆写。
 */
export function waManagementEnvelope(
  entryId: string,
  time: number,
  value: WirePayload,
  field: string,
): WirePayload {
  return {
    entry: [{ id: entryId, time, changes: [{ value, field }] }],
    object: "whatsapp_business_account",
  };
}

/**
 * 回调信封的公共 ID 生成规则（§附速查：WABA id 与 phone_number_id 均为
 * 纯数字串、display_phone_number 为纯数字 E.164 无 +；新建事件即新号码/
 * 账户语境故重生成）。
 */
export function waEnvelopeIdGenerations(): IdGeneration[] {
  return [
    { path: "entry[0].id", kind: "waAccountId" },
    {
      path: "entry[0].changes[0].value.metadata.display_phone_number",
      kind: "waPhone",
    },
    {
      path: "entry[0].changes[0].value.metadata.phone_number_id",
      kind: "waAccountId",
    },
  ];
}

/**
 * statuses[0] 元素的公共 ID 生成规则（§附速查：wamid 三处同源幂等键、
 * timestamp 秒级字符串、recipient_id 纯数字 E.164 无 +）。
 */
export function waStatusIdGenerations(): IdGeneration[] {
  return [
    { path: "entry[0].changes[0].value.statuses[0].id", kind: "waWamid" },
    {
      path: "entry[0].changes[0].value.statuses[0].timestamp",
      kind: "createTimeSec",
    },
    {
      path: "entry[0].changes[0].value.statuses[0].recipient_id",
      kind: "waPhone",
    },
  ];
}

/**
 * 管理面信封的公共 ID 生成规则（§5.4/§5.5 形态：entry[].time 为数字秒级，
 * 与 messages 族的字符串形态不同）。
 */
export function waManagementIdGenerations(): IdGeneration[] {
  return [
    { path: "entry[0].id", kind: "waAccountId" },
    { path: "entry[0].time", kind: "createTimeSecNumber" },
  ];
}
