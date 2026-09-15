import { MT_IM_SCHEMAS } from "./meituan/im";
import { MT_ORDER_SCHEMAS } from "./meituan/order";
import { MT_DEFINITIONS } from "./meituan/shared";

/**
 * 美团渠道协议元数据（技术服务合作中心回调，事实库
 * docs/research/channels/meituan.md）：订单三态推送（meituan/order：
 * docDetail/177/180 §5.3 关键字段逐字 + food/7 必接口径，三态 2/4/8）
 * + IM 单聊回调 1（meituan/im：docDetail/842 §5.4 字段表逐字，biz_type=1）。
 * 传输/签名/探针：POST form-urlencoded（对象/数组先转 JSON 字符串再作表单
 * 字段，官方口径；端口仅 80/8080），签名 = MD5(url?字母序 k=v 串 + app
 * secret) 32 位小写（§4.1 官方五步，官方向量
 * 00934d00d0aea6f12161edfb6456143d 已对拍）——签名与探针握手由 Rust 适配器
 * 完成；IM push_content 结构/退款取消推送体/ISV access_token 流程待核验
 * (09-27)，载荷只收官方已实锤字段。
 */

export { MT_DEFINITIONS };

export const MT_SCHEMAS = [...MT_ORDER_SCHEMAS, ...MT_IM_SCHEMAS] as const;
