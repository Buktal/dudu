import h5Definitions from "../../definitions/eleme/eleme-h5.json";
import orderDefinitions from "../../definitions/eleme/eleme-order.json";
import {
  mergeChannelDefinitions,
  parseChannelDefinition,
} from "../../definitions/loader";
import type { ExpectedReceipt } from "../types";

/**
 * 饿了么渠道协议元数据公共体（事实库 docs/research/channels/eleme.md，
 * 用户线推送；商户线 app_key 包络按事实库口径暂不实现）：
 * - 传输（事实库 §3.1 signal/index + h5 order 全文）：HTTP POST 推到合作方
 *   地址，无 challenge 握手、无 token、无加密；v2 订单推送为 JSON 明文
 *   （§5.2–§5.5 载荷逐字），H5 推送为 application/x-www-form-urlencoded
 *   表单（§5.6）；系统级参数 consumer_key/timestamp/sig 一律放 Query String
 *   （§4.1），由 Rust 适配器直发时补齐，模板只持业务字段
 * - 签名（事实库 §4.1 官方五步逐字，Rust 适配器实现）：除 sig 外全部参数
 *   按参数名 ASCII 排序 & 连接（值 utf-8 后 urlencode，未保留字 `- _ . ~`、
 *   空格编 +）→ 请求 url + ? + 排序串 + consumer_secret 无缝尾拼 → UTF-8
 *   逐字节 HEX → SHA1 40 位小写；官方示例待签串（§4.1 步骤 2 逐字）已复现，
 *   官方示例 sig e76dfee… 为示意值、与示例待签串对不上（真实 secret 未公开），
 *   不以示意值作对拍；推送验签字段级（§7.7）与失败重试间隔/次数（§7.6）
 *   待核验(09-27)——JSON 推送按 §4.1 同构以 Query 系统参数参签，H5 表单按
 *   「签名方式和平台请求饿了么方式一样」（§5.6 逐字）以表单全字段参签
 * - 应答（§5.1 逐字）：HTTP 200 且 body `{"message": "ok"}`（H5 页另要求
 *   content-type application/json），否则判失败并重试；频控按 consumer_key
 *   限每分钟请求总数、超限 `1009`、具体数值由饿了么与第三方协商确定
 *   （rate-limit 全文照录）
 * - 模板两源（官方实锤逐字）：v2 订单四推送（eleme/order：§5.2 订单状态
 *   order_status_update + §5.3 配送 + §5.4 退单 + §5.5 赔偿——官方页首标注
 *   「暂时不对外开放」，载荷已全文核验故收录并注明）+ H5 表单推送
 *   （eleme/h5：§5.6 push_action 1/2 字段表）
 * 字段说明与版本/来源由 definitions/eleme/ 分域描述文件装载即校验后合并。
 */

/** 版本化字段描述文件：按域分两份，装载即校验（坏文件启动即炸）后合并 */
export const ELE_DEFINITIONS = mergeChannelDefinitions(
  [orderDefinitions, h5Definitions].map((part) => parseChannelDefinition(part)),
);

/**
 * 官方成功应答（事实库 §3.1/§5.1 两处全文一致）：HTTP 200 且 body 为
 * `{"message": "ok"}`，否则判失败并重试——期望按 JSON 字段子集声明（空白
 * 差异不敏感，message 值逐字）。
 */
export const ELE_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: '{"message":"ok"}',
  bodyMode: "jsonField",
};
