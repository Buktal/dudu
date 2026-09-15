import {
  mergeChannelDefinitions,
  parseChannelDefinition,
} from "../../definitions/loader";
import imDefinitions from "../../definitions/meituan/meituan-im.json";
import orderDefinitions from "../../definitions/meituan/meituan-order.json";
import type { ExpectedReceipt, IdGeneration, WirePayload } from "../types";

/**
 * 美团渠道协议元数据公共体（事实库 docs/research/channels/meituan.md，
 * 技术服务合作中心回调）：
 * - 传输（事实库 §3.1「对 MockPulse 模拟的直接含义」+ 附速查）：POST 普通表单
 *   参数（application/x-www-form-urlencoded; charset=UTF-8，非 JSON；官方旧文
 *   称 Content-Type: text），端口仅 80/8080；推送参数未排序（排序只发生在
 *   签名计算）；系统级参数 app_id/timestamp（调用时 UNIX 秒）/sig 由 Rust
 *   适配器在直发时补齐并签名，模板只持业务字段
 * - 签名（事实库 §4.1 官方五步逐字，Rust 适配器实现）：所有参数（sig 除外）
 *   按参数名字母序排序 & 连接 → 请求 url + ? + 排序串 + app secret 拼接 →
 *   MD5 → 32 位小写 hex 赋给 sig；官方向量
 *   00934d00d0aea6f12161edfb6456143d（guide/31 §5.1 待签串逐字）已对拍
 * - 待核验(09-27)口径（不编造，事实库 §7）：IM push_content 结构、退款/取消
 *   推送体、门店绑定推送体、ISV access_token 参签流程均待核验——模板只收
 *   官方已实锤字段
 * - 模板两源（官方实锤逐字）：订单三态推送（meituan/order：docDetail/177/180
 *   §5.3 关键字段逐字 + food/7 必接口径）+ IM 单聊回调（meituan/im：
 *   docDetail/842 §5.4 字段表逐字，骨架从简）
 * 字段说明与版本/来源由 definitions/meituan/ 分域描述文件装载即校验后合并。
 */

/** 版本化字段描述文件：按域分两份，装载即校验（坏文件启动即炸）后合并 */
export const MT_DEFINITIONS = mergeChannelDefinitions(
  [orderDefinitions, imDefinitions].map((part) => parseChannelDefinition(part)),
);

/**
 * 订单三态推送的官方成功应答（事实库 §3.2/§5.2 逐字）：2 秒内回
 * `{"data":"ok"}`（小写 ok），失败每隔 1 分钟重试共 3 次——期望按 JSON
 * 字段子集声明（空白差异不敏感，data 值逐字）。
 */
export const MT_ORDER_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: '{"data":"ok"}',
  bodyMode: "jsonField",
};

/**
 * IM 单聊回调的官方成功应答（事实库 §3.2/§5.2/§5.4 逐字）：4 秒内回
 * `{"data":"OK"}`（大写 OK，与订单类大小写不同，照录），超时/格式错→重推
 * + 短信报警（目录级证实逐字待核验(09-27)）。
 */
export const MT_IM_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: '{"data":"OK"}',
  bodyMode: "jsonField",
};

/**
 * 订单三态推送骨架（事实库 §5.3 docDetail/177/180 核验字段逐字，文档序）：
 * 三态共用同一字段族——官方口径「已订阅字段在已支付/已确认/已完成三种推送中
 * 同时生效」（§2.1），推送类型由回调 URL 区分（按推送项逐项配置，§3.1），
 * 载荷内无实锤 status 字段，不编造。值即官方样本原文（电话为隐私号形态）；
 * form 线上值恒为文本——标量按线上文本形态存储（同 XML 先例），数组字段
 * （backup_recipient_phone）以 JSON 结构存储、拼装时转 JSON 字符串。
 */
export function mtOrderPayload(): WirePayload {
  return {
    order_id: "27061900338318741",
    order_tag_list: "8",
    wm_order_id_view: "27061900338318741",
    app_poi_code: "668921",
    wm_poi_name: "药品01店",
    recipient_phone: "13812345678_1236",
    backup_recipient_phone: ["13812345678_1236", "13812345678_3456"],
    delivery_time: "0",
    pay_type: "2",
    logistics_code: "0000",
  };
}

/** 订单三态的 ID 生成规则：订单号重生成，展示 ID 跟随（官方样本两 ID 同值）。 */
export const MT_ORDER_ID_GENERATIONS: IdGeneration[] = [
  { path: "order_id", kind: "mtBizId" },
  { path: "wm_order_id_view", kind: "mtBizId", sameAs: "order_id" },
];
