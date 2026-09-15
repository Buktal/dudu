import { ALI_GATEWAY_SCHEMAS } from "./alipay/gateway";
import { ALI_NOTIFY_SCHEMAS } from "./alipay/notify";
import { ALI_DEFINITIONS } from "./alipay/shared";

/**
 * 支付宝渠道协议元数据（异步通知三地址体系，事实库
 * docs/research/channels/alipay.md）：支付异步通知（alipay/notify：
 * §5.1 公共参数表 + 业务参数表逐字，notify_url 代表事件 trade_status_sync）
 * + 应用网关/From 蚂蚁订阅代表 2（alipay/gateway：topic 接口名逐字，官方未给
 * 载荷样本、信封值占位注明）。全部 wire = form（POST 表单，§2.1/§3.1）。
 * 传输/签名/探针：POST form-urlencoded 到三地址之一（接口 notify_url / 应用
 * 网关 / From 蚂蚁订阅），签名 = RSA2（rsaCheckV1 语义：剔除 sign/sign_type →
 * url_decode → 字典序 k=v & 连接 → RSA-SHA256(PKCS#1 v1.5)，sign 为 base64，
 * §4.3/§4.1）——签名与探针由 Rust 适配器完成；应答 success + HTTP 200、
 * fail 重推 25h 8 次（支付 4m 首重 / From 蚂蚁 2m 首重）、notify_id 幂等
 * （§3.3/§3.4）；小程序客服是前端组件非服务端推送（§2.4），不入模板。
 */

export { ALI_DEFINITIONS };

export const ALI_SCHEMAS = [
  ...ALI_NOTIFY_SCHEMAS,
  ...ALI_GATEWAY_SCHEMAS,
] as const;
