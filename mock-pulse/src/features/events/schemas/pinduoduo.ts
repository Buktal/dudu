import { PDD_ORDER_SCHEMAS } from "./pinduoduo/order";
import { PDD_DEFINITIONS } from "./pinduoduo/shared";

/**
 * 拼多多渠道协议元数据（PMC 订阅推送，事实库 docs/research/channels/pinduoduo.md）：
 * 订单三态推送（pinduoduo/order：§2.1 状态照录 1-待发货 / 2-已发货代签收 /
 * 3-已签收，三态穷尽）。传输/签名/探针：POST JSON body + 签名 = UPPER(MD5(
 * client_secret + ASCII 排序 k+v 拼接 + client_secret))（§4.1 官方三步逐字，
 * 官方向量 E4DE3ED21002510DED352819E7AE6775 已核验）；公共参数 client_id/
 * timestamp（UNIX 秒）——签名与探针握手由 Rust 适配器完成。推送传输形态/
 * topic 目录/重试幂等均待核验(09-27)，订阅开/关接口 pdd.pmc.user.permit/
 * cancel 仅接口名实锤（事实库标注待核验），载荷只收官方已实锤字段。
 */

export { PDD_DEFINITIONS };

export const PDD_SCHEMAS = [...PDD_ORDER_SCHEMAS] as const;
