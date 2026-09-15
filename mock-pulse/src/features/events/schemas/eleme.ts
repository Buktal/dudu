import { ELE_H5_SCHEMAS } from "./eleme/h5";
import { ELE_ORDER_SCHEMAS } from "./eleme/order";
import { ELE_DEFINITIONS } from "./eleme/shared";

/**
 * 饿了么渠道协议元数据（用户线推送，事实库
 * docs/research/channels/eleme.md）：v2 订单四推送（eleme/order：§5.2 订单
 * 状态 order_status_update + §5.3 配送 + §5.4 退单 + §5.5 赔偿——官方标注
 * 「暂时不开放」，载荷全文核验故收录并注明，wire = json 载荷逐字）+ H5 表单
 * 推送 2（eleme/h5：§5.6 push_action 1/2，wire = form 复用 #44 形态）。
 * 传输/签名/探针：HTTP POST 无握手无 token 无加密，成功 = HTTP 200 +
 * {"message":"ok"}（§5.1 逐字）；签名 = SHA1(HEX(url?字母序 k=v 串 +
 * consumer_secret)) 40 位小写（§4.1 官方五步，官方示例待签串已复现，示例
 * sig 值为示意值不自洽已照录）——签名与 Query 系统参数由 Rust 适配器完成；
 * 推送验签字段级/重试间隔次数待核验(09-27)，商户线 app_key 包络暂不实现。
 */

export { ELE_DEFINITIONS };

export const ELE_SCHEMAS = [...ELE_ORDER_SCHEMAS, ...ELE_H5_SCHEMAS] as const;
