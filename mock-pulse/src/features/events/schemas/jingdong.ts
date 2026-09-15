import { JD_AFS_SCHEMAS } from "./jingdong/aftersale";
import { JD_DONGDONG_SCHEMAS } from "./jingdong/dongdong";
import { JD_ORDER_SCHEMAS } from "./jingdong/order";
import { JD_DEFINITIONS } from "./jingdong/shared";

/**
 * 京东渠道协议元数据（JOS 消息推送，事实库 docs/research/channels/jingdong.md）：
 * 订单 9 状态推送（jingdong/order：§2.1 状态枚举逐字，全目录穷尽）+ 售后
 * AFS_StepResult_JOS 1（jingdong/aftersale：§2.2 消息名实锤，载荷骨架从简）
 * + 咚咚 2（jingdong/dongdong：chat_message4.2 唯一官方 voice 片段逐字 +
 * push2 五应用级参数 §5.3 逐字）。传输/签名/探针同族：POST 明文 JSON +
 * 系统参数 query（app_key/v/timestamp 10 分钟窗/sign = UPPER(MD5(appSecret+
 * 字母序 k+v+appSecret))，应用级参数以 360buy_param_json 名参与签名）——
 * 签名与探针握手由 Rust 适配器完成；推送通道投递/回调验签/重试幂等均
 * 待核验(09-27)，载荷只收官方已实锤字段。
 */

export { JD_DEFINITIONS };

export const JD_SCHEMAS = [
  ...JD_ORDER_SCHEMAS,
  ...JD_AFS_SCHEMAS,
  ...JD_DONGDONG_SCHEMAS,
] as const;
