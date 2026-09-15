import aftersaleDefinitions from "../../definitions/jingdong/jingdong-aftersale.json";
import dongdongDefinitions from "../../definitions/jingdong/jingdong-dongdong.json";
import orderDefinitions from "../../definitions/jingdong/jingdong-order.json";
import {
  mergeChannelDefinitions,
  parseChannelDefinition,
} from "../../definitions/loader";
import type { ExpectedReceipt } from "../types";

/**
 * 京东渠道协议元数据公共体（事实库 docs/research/channels/jingdong.md）：
 * - 传输（事实库附「对 MockPulse 模拟的直接含义」网关模拟口径 + §4.2 系统参数
 *   表）：POST 明文 JSON + 系统参数走 URL query——app_key / v=2.0 /
 *   timestamp（yyyy-MM-dd HH:mm:ss，服务端允许 10 分钟误差）/ sign；应用级参数
 *   整体 JSON 官方恒以 360buy_param_json 名参与签名（§4.1），推送模拟中即事件
 *   明文（body 同值逐字节透传）。签名/验签与探针握手由 Rust 适配器完成
 * - 待核验(09-27)口径：推送通道投递形态、首次验证握手、重试幂等、推送回调
 *   验签均未取得官方原文（listId=520 未取得）——适配器以「探针 + 唯一实锤的
 *   §4.1 签名规则」模拟，不编造 challenge/信封；模板载荷只收官方已实锤字段
 * - 模板四源（官方实锤逐字）：订单 9 状态推送（jingdong/order：§2.1 状态枚举
 *   + §5.1 订单参数词汇）+ 售后 AFS_StepResult_JOS 1（jingdong/aftersale：
 *   §2.2 消息名实锤，载荷骨架从简）+ 咚咚 2（jingdong/dongdong：chat_message
 *   4.2 协议体唯一官方 voice 片段逐字 + push2 五应用级参数 §5.3 逐字）
 * 字段说明与版本/来源由 definitions/jingdong/ 分域描述文件装载即校验后合并。
 */

/** 版本化字段描述文件：按域分三份，装载即校验（坏文件启动即炸）后合并 */
export const JD_DEFINITIONS = mergeChannelDefinitions(
  [orderDefinitions, aftersaleDefinitions, dongdongDefinitions].map((part) =>
    parseChannelDefinition(part),
  ),
);

/**
 * 官方成功语义（事实库现状）：推送应答与回调签收口径待核验(09-27)（§3.1/§5.5
 * 未取得官方原文）——模板期望回执取最中性签收语义 HTTP 200 + 不校验正文，
 * 09-27 复核 listId=520 后收口。
 */
export const JD_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: "",
  bodyMode: "contains",
};
