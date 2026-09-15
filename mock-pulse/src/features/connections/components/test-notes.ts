import type {
  ConnectionConfig,
  DingtalkSystem,
  DouyinSystem,
  WechatMiniMode,
  WechatMpMode,
  WecomSystem,
  XiaohongshuSystem,
} from "../api";

/**
 * 「验证连接」卡片说明文案的按渠道构建器（纯数据，无 JSX）：
 * 握手/探针形态随渠道（推送体系/通道/模式）变化，文案锚定各渠道事实库
 * （docs/research/channels/）。自 connections-view.tsx 按职责拆出
 * （单文件 ≤ 500 行，#46 随支付宝接入拆分）。
 */

/** 抖音握手文案按推送体系呈现（事实库 §3.1/§3.4：四套体系握手形态不同） */
export function douyinTestNote(system: DouyinSystem): string {
  switch (system) {
    case "mini_game":
      return "发送 verify_request（x-signature 五头），检查服务是否验签通过并回 HTTP 200。";
    case "isv":
      return "按授权推送形态发送 TOKEN 重签信封，检查服务是否直接返回 success（不带引号）。";
    default:
      return "发送 challenge，检查服务是否原样返回验证内容。";
  }
}

/** 企微握手文案按推送通道呈现（官方 GET echostr 流程相同，receiveid 语义不同） */
export function wecomTestNote(system: WecomSystem): string {
  if (system === "aibot") {
    return "发送加密 echostr（receiveid 为空串），检查服务是否正确解密并回显。";
  }
  return "发送加密 echostr，检查服务是否正确解密并回显。";
}

/** 公众号握手文案按消息加解密方式呈现（GET 三参握手三模式同一流程） */
export function wechatMpTestNote(mode: WechatMpMode): string {
  const suffix =
    mode === "plain"
      ? "明文模式。"
      : mode === "compatible"
        ? "兼容模式。"
        : "安全模式。";
  return `发送 GET（signature=sha1(字典序排序(Token,timestamp,nonce)) 与随机 echostr），检查服务是否验签通过并原样回显 echostr。${suffix}`;
}

/** 小程序握手文案（与公众号同族 GET 三参握手，三模式同一流程） */
export function wechatMiniTestNote(mode: WechatMiniMode): string {
  const suffix =
    mode === "plain"
      ? "明文模式。"
      : mode === "compatible"
        ? "兼容模式。"
        : "安全模式。";
  return `发送 GET（signature=sha1(字典序排序(Token,timestamp,nonce)) 与随机 echostr），检查服务是否验签通过并原样回显 echostr。${suffix}`;
}

/** 飞书握手文案（POST url_verification challenge，现行 1s 应答口径） */
export function feishuTestNote(draft: ConnectionConfig): string {
  const encrypted = draft.channel === "feishu" && draft.encryptKey !== "";
  return `发送 POST url_verification（challenge/token/type 三参${
    encrypted ? "，AES 加密信封 + X-Lark-Signature 签名" : "明文"
  }），检查服务是否在 1 秒内原样回显 challenge。`;
}

/** 钉钉握手文案按推送通道呈现（事实库 §5.10/§3.3：密文握手与机器人探测） */
export function dingtalkTestNote(system: DingtalkSystem): string {
  if (system === "bot") {
    return "发送带 timestamp/sign（HmacSHA256）头的明文探测请求，检查服务是否验签通过并响应 HTTP 2xx。";
  }
  return "发送 check_url 握手（加密信封 + sha1 四参 URL 签名），检查服务是否在 1500ms 内回可解密的加密 success 包。";
}

/** QQ 握手文案（事实库 §3.2：op13 验证回调，回包 plain_token 回显 + Ed25519 签名） */
export function qqTestNote(): string {
  return "发送 op13 验证回调（User-Agent: QQBot-Callback + X-Bot-Appid），检查服务是否回 plain_token 回显 + Ed25519 签名的验签回包。";
}

/** 微博握手文案（事实库 §3.1：GET 四参，sha1 排序验签 + 原样回 echostr） */
export function weiboTestNote(): string {
  return "发送 GET（signature=sha1(字典序排序(AppSecret,timestamp,nonce)) 与随机 echostr），检查服务是否验签通过并原样回显 echostr。";
}

/** 小红书握手文案按推送通道呈现（事实库 §10.4/§3.4：小程序 GET 握手、ark 无官方口径） */
export function xiaohongshuTestNote(system: XiaohongshuSystem): string {
  if (system === "ark") {
    return '发送最小 ark 推送探针（单条信封的 JSON 数组），检查服务是否回 {"success":true,"error_code":0}（电商侧无官方握手口径）。';
  }
  return "发送 GET（signature=sha1(字典序排序(Token,timestamp,nonce)) 与随机 echostr），检查服务是否验签通过并原样回显 echostr。";
}

/** 快手握手文案（事实库 §3.1/§4.1：配地址握手即 TEST 事件，kwaisign 头验签） */
export function kuaishouTestNote(): string {
  return "发送 TEST 测试事件（header kwaisign = MD5(body+AppSecret)），检查服务是否回 HTTP 200 且 result=1 并回传收到的 message_id。";
}

/** 淘宝握手文案（事实库 §3.2 配置页：填回调地址后 Verify，返回 HTTP 200 即验证成功） */
export function taobaoTestNote(): string {
  return "发送 Verify 验证（POST 官方正向样本明文 + Authorization = HEX(HMAC-SHA256(AppKey+body, AppSecret)) 头），检查服务是否返回 HTTP 200（500ms 签收语义）。";
}

/** 京东握手文案（事实库：官方首次验证握手待核验(09-27)，探针语义同普通推送） */
export function jingdongTestNote(): string {
  return "发送推送探针（POST 官方状态枚举样本明文，query 带 app_key/timestamp/v 与 sign = UPPER(MD5(appSecret+字母序 k+v+appSecret))），检查服务是否返回 HTTP 200（官方验证握手口径待核验，探针语义同普通推送）。";
}

/** 拼多多握手文案（事实库 §3.1：验证握手待核验(09-27)，探针语义同普通推送） */
export function pinduoduoTestNote(): string {
  return "发送推送探针（POST 官方订单状态样本明文，query 带 client_id/timestamp（UNIX 秒）与 sign = UPPER(MD5(client_secret+ASCII 排序 k+v+client_secret))），检查服务是否返回 HTTP 200（官方验证握手口径待核验，探针语义同普通推送）。";
}

/** 美团握手文案（事实库 §3.1：官方验证握手正文待核验(09-27)，探针语义同普通推送） */
export function meituanTestNote(): string {
  return "发送推送探针（POST 官方订单核验样本表单，字段集尾部追加 app_id/timestamp 与 sig = MD5(url?字母序 k=v 串 + App Secret)），检查服务是否返回 HTTP 200（官方验证握手正文待核验，探针语义同普通推送）。";
}

/** 饿了么握手文案（事实库 §3.1：无握手，探针语义同普通推送） */
export function elemeTestNote(): string {
  return '发送推送探针（POST 官方订单状态核验样本明文，query 带 consumer_key/timestamp 与 sig = SHA1(HEX(url?字母序 k=v 串 + Consumer Secret))），检查服务是否返回 HTTP 200（官方无握手，探针语义同普通推送；成功应答口径 HTTP 200 + {"message":"ok"}）。';
}

/** 支付宝握手文案（事实库 §3.2/§7-2：网关验证握手细节待核验(09-27)，探针语义同普通推送） */
export function alipayTestNote(): string {
  return "发送推送探针（POST 官方支付异步通知核验样本表单，sign = Base64(RSA-SHA256(剔除 sign/sign_type 后字典序 k=v 串))，RSA2），检查服务是否返回 HTTP 200 并回纯文本 success（官方网关验证握手细节待核验，探针语义同普通推送）。";
}

/** WhatsApp 握手文案（事实库 §3.2：GET 三参握手，verify_token 匹配 200 裸回 challenge） */
export function whatsappTestNote(): string {
  return "发送 GET（hub.mode=subscribe + 随机 hub.challenge + hub.verify_token），检查服务是否比对 verify_token 并以 HTTP 200 原样裸回 challenge（纯文本非 JSON；不匹配回 403 等非 200）。";
}

/** Telegram 探针文案（事实库 §3.2/§4.1：无 challenge 握手，探针语义同普通推送） */
export function telegramTestNote(): string {
  return "发送 Update 推送探针（POST 官方样本 Update 明文 + 头 X-Telegram-Bot-Api-Secret-Token = Secret Token），检查服务是否原样比对 token 并返回 HTTP 2XY（官方无 challenge 握手：setWebhook 同步返回 True 即成功；非 2XY 按合理次数重推）。";
}

/** B站握手文案（事实库 §3.2 镜像口径：配置保存失焦即发 verify_webhooks，期望原样回 data） */
export function bilibiliTestNote(): string {
  return '发送 verify_webhooks 握手（POST {"event":"verify_webhooks","content":{"data":<随机数>},"timestamp":…} + x-bili-* 签名头表 + Authorization = HMAC-SHA256），检查服务是否解析 data 并以 HTTP 200 原样回 {"data":<数值>}（管理中心填回调地址失焦即触发校验，镜像口径待核验(09-27)；事件推送 5s 建连超时、失败最多共推 3 次）。';
}
