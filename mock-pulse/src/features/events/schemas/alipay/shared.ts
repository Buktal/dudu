import gatewayDefinitions from "../../definitions/alipay/alipay-gateway.json";
import notifyDefinitions from "../../definitions/alipay/alipay-notify.json";
import {
  mergeChannelDefinitions,
  parseChannelDefinition,
} from "../../definitions/loader";
import type { ExpectedReceipt } from "../types";

/**
 * 支付宝渠道协议元数据公共体（事实库 docs/research/channels/alipay.md，
 * 异步通知三地址体系）：
 * - 传输（事实库 §2.1/§3.1）：POST 表单（form-urlencoded，request.Form/$_POST
 *   取参）到三地址之一——接口级 notify_url（支付/交易通知）/ 应用网关（生活号
 *   被动通知等，全应用仅 1 个）/ From 蚂蚁订阅（单笔转账等，需先订阅 topic，
 *   comm_type=HTTP/WebSocket）；信封字段（notify_time/notify_type/notify_id/
 *   app_id/auth_app_id 等 §5.1 公共参数族）属载荷本体、全部参与验签，由模板
 *   携带（与美团系统级参数由适配器补齐不同）
 * - 签名（事实库 §4.3 rsaCheckV1 四步逐字 + §4.1，Rust 适配器实现）：待验签
 *   参数 = 除去 sign、sign_type 外全部通知参数 → url_decode → 字典序排序
 *   （ASCII 递增）→ k=v 用 & 连接得待签串；sign = Base64(RSA-SHA256
 *   (PKCS#1 v1.5)(待签串))（RSA2 = SHA256WithRSA 2048 位）——非对称签名取
 *   RustCrypto rsa crate（#46 预授权，ed25519-dalek #37 先例）；「生活号通知
 *   保留 sign_type」例外仅在商户验签侧（官方未给机理）
 * - 应答（§3.3/§5.3 逐字）：HTTP 200 且纯文本 success（无空格/HTML/重定向，
 *   重定向会被判异常而重发）；fail 或非 200 按 25h 8 次重推（支付类首重 4m /
 *   From 蚂蚁首重 2m，后续 10m/10m/1h/2h/6h/15h，两口径并存照录）
 * - 幂等（§3.4）：notify_id 首选（同条通知重试不变）+ out_trade_no/trade_no
 *   组合；验签后必做 out_trade_no 存在性与 total_amount 金额核对
 * - 待核验(09-27)口径（不编造，事实库 §7）：应用网关验证握手后半程（§3.2/
 *   §7-2，勿硬编码）、生活号被动通知事件表、非交易通知信封枚举值均未取得
 *   官方原文——网关/From 蚂蚁模板只收已实锤词汇（topic 接口名逐字），信封
 *   值取样本形态占位并注明；官方明确「切勿用本 §5.1 拼出的串做验签回归向量」
 *   （§5.1 sign 为截断示意值），签名对拍以「签名 → 验签」自反 + 篡改必败锚定
 * 字段说明与版本/来源由 definitions/alipay/ 分域描述文件装载即校验后合并。
 */

/** 版本化字段描述文件：按域分两份，装载即校验（坏文件启动即炸）后合并 */
export const ALI_DEFINITIONS = mergeChannelDefinitions(
  [notifyDefinitions, gatewayDefinitions].map((part) =>
    parseChannelDefinition(part),
  ),
);

/**
 * 官方成功应答（事实库 §3.3/§5.3 逐字）：HTTP 200 且纯文本 `success`
 * （无空格/HTML/重定向，不再重试）；fail 或非 200 判失败并按 25h 8 次重推。
 */
export const ALI_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: "success",
  bodyMode: "equals",
};
