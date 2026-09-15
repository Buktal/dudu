import { TB_GLOBAL_SCHEMAS } from "./taobao/global";
import { TB_OPENIM_SCHEMAS } from "./taobao/openim";
import { TB_DEFINITIONS } from "./taobao/shared";
import { TB_TRADE_SCHEMAS } from "./taobao/trade";

/**
 * 淘宝渠道协议元数据（全球栈 HTTPS 回调子形态，事实库 docs/research/channels/
 * taobao.md；国内 TOP 无 HTTP 回调、TMC 长连接不在范围，渠道条目带「全球栈」
 * 标注）：交易/退款代表事件 2（taobao/trade：TradeCreate/RefundCreated，TOP
 * topic 核验载荷页逐字）+ 全球栈 HTTP 回调 2（taobao/global：正向/逆向示例，
 * 接收消息页逐字信封）+ OpenIM 离线消息 1（taobao/openim：OffMsgPush，旺旺
 * envelope 形态参考）。传输/验签/应答同族：POST 明文 JSON + 头
 * Authorization = HEX(HMAC-SHA256(AppKey+body, AppSecret))，回 HTTP 200 即
 * 签收（超 500ms 失败、半小时后重试、最多 12 次）——验签与 Verify 握手由
 * Rust 适配器完成。
 */

export { TB_DEFINITIONS };

export const TB_SCHEMAS = [
  ...TB_TRADE_SCHEMAS,
  ...TB_GLOBAL_SCHEMAS,
  ...TB_OPENIM_SCHEMAS,
] as const;
