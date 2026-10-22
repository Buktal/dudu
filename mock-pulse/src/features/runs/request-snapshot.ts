import type { ChannelId } from "@/lib/channels";

import type { RunStep } from "./model";

/**
 * 发送请求快照的按渠道呈现表（纯展示整形，不改线上报文字节）：每渠道一行
 * 描述「URL query 附加段 / 渠道专属头模板 / Content-Type / 报文体」。
 * 自 run-step-detail.tsx 按职责抽出（code-review 退件：13 渠道臂的 if 级联
 * 收敛为数据表，新增渠道 = 此处加一行，不再改组件）。
 * 未列渠道显式走通用形态——只渲染方法/URL/报文体，不套任何渠道专属头
 * （旧行为是静默套用抖音头模板，对 wechat-mp/wechat-mini/feishu/dingtalk
 * 与注册表外渠道都是错误呈现）。
 */
type RequestSnapshotTrait = {
  /** Content-Type（按载荷判型的渠道用函数，如饿了么 JSON/表单双形态） */
  contentType: string | ((step: RunStep) => string);
  /** URL query 附加段（分隔符 ?/& 由渲染器统一处理） */
  query?: (step: RunStep) => string;
  /** 渠道专属头模板（多行头含换行；QQ 按是否带签名分流） */
  headers?: (step: RunStep) => string;
  /** 报文体呈现（缺省 = 载荷明文逐字节快照） */
  body?: (step: RunStep) => string;
};

/**
 * 登记是各渠道的呈现需要，不强制全登记（未登记渠道回落通用表单，
 * 见 requestSnapshot）；键仍须在渠道注册表内——对齐钉在
 * request-snapshot.test.ts 的 parity 用例（仿 channel-registry-parity）。
 */
export const SNAPSHOT_TRAITS: Partial<Record<ChannelId, RequestSnapshotTrait>> =
  {
    wecom: {
      // 企微：三参签名走 URL query（msg_signature/timestamp/nonce），body 即
      // 加密信封（旧记录未保存信封时回退占位 + 附加密前 XML）
      contentType: "text/xml",
      query: (step) =>
        `msg_signature=${encodeURIComponent(step.signature)}&timestamp=${step.timestamp ?? ""}&nonce=${encodeURIComponent(step.msgId)}`,
      body: (step) =>
        `${step.requestBody ?? "（旧记录未保存加密信封）"}\n\n加密前 XML：\n${step.payload}`,
    },
    qq: {
      // QQ：普通事件带 Ed25519 签名三头；op13 验证回调无签名头（msgId 快照 plain_token）
      contentType: "application/json",
      headers: (step) =>
        step.signature
          ? `X-Signature-Ed25519: ${step.signature}\nX-Signature-Timestamp: ${step.timestamp ?? ""}`
          : `User-Agent: QQBot-Callback（op13 验证回调）\nX-Bot-Appid: <连接 AppID>`,
    },
    weibo: {
      // 微博：三参签名走 URL query（官方每次推送同样验签；msgId 快照 nonce）
      contentType: "application/json",
      query: (step) =>
        `signature=${step.signature}&timestamp=${step.timestamp ?? ""}&nonce=${step.msgId}`,
    },
    xiaohongshu: {
      // 小红书：小程序通道 body 即加密信封 {Nonce,Timestamp,Encrypt,MsgSignature}
      // （签名在 body 内，签名快照即 MsgSignature）；ark 通道 body 为官方批量
      // 数组（payload 为单条信封，数组包裹见 requestBody 快照）
      contentType: "application/json",
      body: (step) =>
        `${step.requestBody ?? step.payload}${step.payload && step.requestBody && step.requestBody !== step.payload ? `\n\n加密/包裹前明文：\n${step.payload}` : ""}`,
    },
    kuaishou: {
      // 快手：验签在 header（kwaisign = MD5(原始 body + AppSecret)，无 AES），
      // body 即明文 JSON 逐字节透传；message_id 幂等键在载荷内（msgId 快照即它）
      contentType: "application/json",
      headers: (step) => `kwaisign: ${step.signature}`,
    },
    taobao: {
      // 淘宝（全球栈）：验签在 header（Authorization = HEX(HMAC-SHA256(AppKey+body,
      // AppSecret))，数据明文传输）；body 即明文 JSON 逐字节透传，msgId 快照取
      // tid/refund_id/msg_id 等业务幂等键
      contentType: "application/json",
      headers: (step) => `Authorization: ${step.signature}`,
    },
    jingdong: {
      // 京东（JOS）：系统参数走 URL query（app_key/timestamp(yyyy-MM-dd HH:mm:ss，
      // 10 分钟窗)/v=2.0 + sign = UPPER(MD5(appSecret+字母序 k+v+appSecret))，
      // 应用级参数 360buy_param_json 即 body 明文同值参与签名）；msgId 快照取
      // 载荷业务单号（order_id/serviceId）
      contentType: "application/json",
      query: (step) =>
        `app_key=<连接 AppKey>&timestamp=${encodeURIComponent(step.timestamp ?? "")}&v=2.0&sign=${step.signature}`,
    },
    pinduoduo: {
      // 拼多多（PMC 订阅推送）：公共参数走 URL query（client_id/timestamp
      // （UNIX 秒）+ sign = UPPER(MD5(client_secret+ASCII 排序 k+v+client_secret))，
      // 覆盖 query 公共参数与 body 明文顶层 kv）；msgId 快照取载荷订单号
      contentType: "application/json",
      query: (step) =>
        `client_id=<连接 ClientID>&timestamp=${encodeURIComponent(step.timestamp ?? "")}&sign=${step.signature}`,
    },
    meituan: {
      // 美团（合作中心回调）：POST form-urlencoded，表单字段集尾部追加系统参数
      // 与 sig = MD5(url?字母序 k=v 串 + AppSecret)（官方推送参数未排序，追加
      // 不重排）；requestBody 快照即实际发出的完整表单字节；msgId 快照取载荷订单号
      contentType: "application/x-www-form-urlencoded",
      body: (step) => `${step.requestBody ?? step.payload}`,
    },
    eleme: {
      // 饿了么（用户线推送）：系统参数一律放 Query（§4.1，consumer_key/sig/
      // timestamp，sig = SHA1(HEX(url?字母序 k=v 串 + Consumer Secret))）；
      // v2 JSON 推送 body 逐字节透传、H5 表单推送业务字段原字节保留，按明文
      // 判型区分 Content-Type；msgId 快照取 eleme_order_id/order_id
      contentType: (step) =>
        step.payload.trimStart().startsWith("{")
          ? "application/json"
          : "application/x-www-form-urlencoded",
      query: (step) =>
        `consumer_key=<连接 ConsumerKey>&sig=${step.signature}&timestamp=${step.timestamp ?? ""}`,
      body: (step) => `${step.requestBody ?? step.payload}`,
    },
    alipay: {
      // 支付宝（异步通知三地址）：POST form-urlencoded，信封字段在表单内，
      // 尾部追加现算 sign = Base64(RSA-SHA256(剔除 sign/sign_type 后字典序
      // k=v 串))（rsaCheckV1 语义）；requestBody 快照即实际发出的完整表单字节
      // （旧 sign 已剔除）；msgId 快照取 notify_id（幂等键 §3.4），timestamp
      // 快照即信封 notify_time
      contentType: "application/x-www-form-urlencoded",
      body: (step) => `${step.requestBody ?? step.payload}`,
    },
    whatsapp: {
      // WhatsApp（Cloud API Webhook）：验签在 header（X-Hub-Signature-256 =
      // sha256=hex(HMAC-SHA256(AppSecret, 原始 body))，载荷不设加密字段）；
      // body 即明文 JSON 逐字节透传，msgId 快照取 wamid（messages[].id /
      // statuses[].id 三处同源），无独立时间戳要素
      contentType: "application/json",
      headers: (step) => `X-Hub-Signature-256: ${step.signature}`,
    },
    telegram: {
      // Telegram（Bot Webhook）：无 HMAC 无加密，验证仅恒等头
      // X-Telegram-Bot-Api-Secret-Token（signature 快照即头值 = Secret Token
      // 原样回显，接收侧字符串相等比较）；body 即 JSON Update 逐字节透传，
      // update_id 为去重/恢复顺序幂等键（msgId 快照即它），无 query 与时间戳要素
      contentType: "application/json",
      headers: (step) => `X-Telegram-Bot-Api-Secret-Token: ${step.signature}`,
    },
    bilibili: {
      // B站（开放平台 Webhooks）：验证 = x-bili-* 签名头表 + Authorization =
      // HMAC-SHA256（signature 快照即 Authorization，x-bili-timestamp 快照即
      // timestamp，其余 x-bili-* 头由适配器随请求携带）；body 即事件明文
      // 逐字节透传，官方无幂等键字段（nonce 快照作 msgId，5s 超时最多共推 3 次）
      contentType: "application/json",
      headers: (step) =>
        `x-bili-timestamp: ${step.timestamp ?? ""}\nAuthorization: ${step.signature}`,
    },
    douyin: {
      // 抖音（dop/生活服务）：验签在 header（X-Douyin-Signature = sha1(secret+body)），
      // Msg-Id 头作幂等键；body 即明文 JSON 逐字节透传
      contentType: "application/json",
      headers: (step) =>
        `X-Douyin-Signature: ${step.signature}\nMsg-Id: ${step.msgId}`,
    },
  };

/** query 附加段的分隔符：目标地址已带 query 时接 & */
function queryPrefix(url: string): string {
  return url.includes("?") ? "&" : "?";
}

function renderSnapshot(trait: RequestSnapshotTrait, step: RunStep): string {
  const contentType =
    typeof trait.contentType === "function"
      ? trait.contentType(step)
      : trait.contentType;
  const query = trait.query
    ? `${queryPrefix(step.url)}${trait.query(step)}`
    : "";
  const head = [`POST ${step.url}${query}`, `Content-Type: ${contentType}`];
  if (trait.headers) {
    head.push(trait.headers(step));
  }
  return `${head.join("\n")}\n\n${trait.body ? trait.body(step) : step.payload}`;
}

/** 发送请求快照：按渠道查表渲染；未列渠道显式通用形态（方法/URL/报文体） */
export function requestSnapshot(step: RunStep): string {
  const trait = SNAPSHOT_TRAITS[step.channel];
  if (!trait) {
    return `POST ${step.url}\n\n${step.payload}`;
  }
  return renderSnapshot(trait, step);
}
