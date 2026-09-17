import {
  bilibiliTimestamp,
  compactTimestamp,
  taobaoModified,
  weiboCreatedAt,
} from "@/lib/time";

import {
  BASE64_CHARS,
  hexChars,
  randomBytes,
  randomDigits,
  randomFromChars,
} from "./random";

/**
 * 官方 ID 形态生成单点（C6 合并：平台/IM 系 + 电商/交易系 + 海外/全域
 * 原先按渠道族拆分为三个文件，实为同一关注——各模板 idGenerations 声明的
 * 生成函数表；合并后注册表（./index GENERATORS）与实现同层可查）。
 * 共享随机基础件仍在 ./random（拒绝采样消模偏差，真深度保留独立文件）。
 */

export function generateOpenId(): string {
  return crypto.randomUUID();
}

export function generateEncryptedId(): string {
  const body = randomFromChars(BASE64_CHARS, 86);
  return `@${body}==`;
}

export function generateLogId(): string {
  const bytes = randomBytes(9);
  return (
    compactTimestamp() +
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

export function generateCreateTimeMs(): number {
  return Date.now();
}

/** 企微 CreateTime：10 位 Unix 秒级时间戳（字符串形态，XML 裸文本输出） */
export function generateCreateTimeSec(): string {
  return String(Math.floor(Date.now() / 1000));
}

/** 10 位 Unix 秒级时间戳（数字形态：小游戏 CreateTime、digg action_time） */
export function generateCreateTimeSecNumber(): number {
  return Math.floor(Date.now() / 1000);
}

/** 企微 MsgId：18 位数字串（首位非零，恒 < 2^63-1） */
export function generateMsgId64(): string {
  return randomDigits(18);
}

/** 企微智能机器人 msgid：base64 风格串（官方样本 31 字符 + "="，可含 + /） */
export function generateAibotMsgId(): string {
  return `${randomFromChars(BASE64_CHARS, 31)}=`;
}

/** 飞书 event_id：32 位小写十六进制串（官方样本形态） */
export function generateHexId32(): string {
  return hexChars(32);
}

/** 飞书 create_time：13 位毫秒时间戳（字符串形态，JSON 内带引号） */
export function generateCreateTimeMsString(): string {
  return String(Date.now());
}

/** 飞书 open_id：ou_ + 32 位十六进制（官方样本 ou_84aad35d084aa403a838cf73ee18467） */
export function generateLarkOpenId(): string {
  return `ou_${hexChars(32)}`;
}

/** 飞书 union_id：on_ + 32 位十六进制（官方样本 on_8ed6aa67826108097d9ee143816345） */
export function generateLarkUnionId(): string {
  return `on_${hexChars(32)}`;
}

/** 飞书 message_id：om_ + 32 位十六进制（幂等键，官方样本 om_dc132645…） */
export function generateLarkMessageId(): string {
  return `om_${hexChars(32)}`;
}

/** 飞书 chat_id：oc_ + 32 位十六进制（单聊/群共用，官方样本 oc_5ad11d72…） */
export function generateLarkChatId(): string {
  return `oc_${hexChars(32)}`;
}

/**
 * 钉钉机器人 msgId：24 字符 base64 风格 + "=="（幂等键，官方样本
 * msgrK2ckHkMbaiUWt5xQU+riw== 的形态；16 字节消息标识的 base64 即此长度）
 */
export function generateDingtalkMsgId(): string {
  return `${randomFromChars(BASE64_CHARS, 24)}==`;
}

const ALPHANUMERIC_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * QQ 消息 id：ROBOT1.0_ 前缀 + 56 位字母数字（官方黄金样本掩码占位为
 * 56 个 x，事实库「对 MockPulse 模拟的直接含义」ID 形态速查）
 */
export function generateQqRobotMsgId(): string {
  return `ROBOT1.0_${randomFromChars(ALPHANUMERIC_CHARS, 56)}`;
}

/** QQ openid：32 位大写十六进制（user_openid/group_openid/member_openid 形态） */
export function generateQqOpenId(): string {
  return randomFromChars("0123456789ABCDEF", 32);
}

/**
 * 微博 receiver_id/sender_id：int64 数字 UID（官方样本 1902538057/2489518277
 * 为 10 位数；数字形态直落 JSON，10 位 < 2^53 无精度问题）
 */
export function generateWeiboUid(): number {
  return Number(randomDigits(10));
}

/** 微博 created_at：线上字符串形态（格式经 lib/time 封装单点） */
export function generateWeiboCreatedAt(): string {
  return weiboCreatedAt();
}

/**
 * 小红书 MsgId：官方仅口径为字符串（事实库 §10.3），无格式样本——按微信系
 * int64 MsgId 同族的 18 位数字串生成（全程字符串，不经 number 防精度丢失）
 */
export function generateXhsMsgId(): string {
  return randomDigits(18);
}

/**
 * 快手 message_id：官方支付回调样本为小写 UUID 形态（事实库 §4.1 样本
 * 76a50e0c-a843-492b-…；「每次随机生成的 ID」，重试保持一致——幂等键随新事件变化）
 */
export function generateKsMessageId(): string {
  return crypto.randomUUID();
}

/**
 * 淘宝业务单号（tid/oid/refund_id）：官方样本为数字串形态（TradeCreate 的
 * tid "123456789"、RefundCreated 的 oid "110770592823138"），JSON 里恒为
 * 字符串——取 9~15 位数字串（首位非零）。
 */
export function generateTaobaoBizId(): string {
  return randomDigits(9 + (randomBytes(1)[0] % 7));
}

/** 淘宝退款 modified：线上字符串形态（格式经 lib/time 封装单点） */
export function generateTaobaoModified(): string {
  return taobaoModified();
}

/**
 * OpenIM msg_id：19 位数字串（官方样本 6269105334747922432 为 int64 形态，
 * 首位取 1~6 保证恒小于 2^63-1）
 */
export function generateOpenimMsgId(): string {
  return randomDigits(19, { min: 1, max: 6 });
}

/**
 * 京东业务单号（订单号/服务单号）：官方未给格式样本（事实库仅「京东订单号」
 * 「服务单号」词汇实锤），按京东单号数字串同族形态取 9~15 位数字串（首位非零）。
 */
export function generateJdBizId(): string {
  return randomDigits(9 + (randomBytes(1)[0] % 7));
}

/**
 * 拼多多订单号：官方未给格式样本（事实库仅「轻量变更通知含订单号」口径），
 * 按电商单号数字串同族形态取 9~15 位数字串（首位非零）。
 */
export function generatePddBizId(): string {
  return randomDigits(9 + (randomBytes(1)[0] % 7));
}

/**
 * 美团订单号：官方样本 27061900338318741 为 17 位数字串（docDetail/177/180
 * 核验样本，bigint(20) 存储）——取 15~17 位数字串（首位非零，17 位仍在
 * int64 内）；订单三态推送 order_id 与 wm_order_id_view（sameAs）共用。
 */
export function generateMtBizId(): string {
  return randomDigits(15 + (randomBytes(1)[0] % 3));
}

/**
 * 饿了么订单号 eleme_order_id：官方样本 12637645858619059（17 位）与
 * 100025663239521904（18 位）为纯数字字符串（事实库 §5.2/§5.4 核验样本）——
 * 取 17~18 位数字串，首位取 1 保证恒小于 2^63-1；全程字符串不经 number
 * 防精度丢失；订单状态/配送/退单/赔偿四推送共用。
 */
export function generateEleBizId(): string {
  return randomDigits(17 + (randomBytes(1)[0] % 2), 1);
}

/**
 * 支付宝通知校验 ID notify_id：官方样本 ac05099524730693a8b330c45cf72da943
 * 为 35 位小写十六进制串（事实库 §5.1 公共参数表逐字，「通知校验 ID」128 位
 * 口径）——同条异步通知重试时 notify_id 不变（§3.4 逐字），幂等键首选；
 * 新建事件即新通知故重生成，三地址代表模板共用。
 */
export function generateAliNotifyId(): string {
  return hexChars(35);
}

/**
 * WhatsApp 消息 ID wamid：官方样本 wamid.HBgL… 为前缀 + base64 风格串
 * （样本主体 48~51 字符、可带尾部 "="，事实库「ID 形态」速查）——三处同源
 * 幂等键，新建事件即新消息故重生成。
 */
export function generateWaWamid(): string {
  const length = 48 + (randomBytes(1)[0] % 4);
  return `wamid.HBgL${randomFromChars(BASE64_CHARS, length)}`;
}

/**
 * WhatsApp 电话 ID：官方样本 16505551234（wa_id/from/recipient_id）与
 * 15550783881（display_phone_number）为纯数字 E.164 无 + 前缀的 11 位数字串。
 */
export function generateWaPhone(): string {
  return randomDigits(11, 1);
}

/**
 * WhatsApp 账户/号码数字 ID：官方样本 WABA 102290129340398 与
 * phone_number_id 106540352242922 为 15 位数字串——首位取 1 保证恒在 2^53 内
 * （全程字符串，不经 number 防精度丢失）。
 */
export function generateWaAccountId(): string {
  return randomDigits(15, 1);
}

/** WhatsApp 会话 ID：官方样本为 32 位小写十六进制串（conversation.id） */
export function generateWaConversationId(): string {
  return hexChars(32);
}

/**
 * WhatsApp 模板 ID：官方样本 1689556908129832 为 16 位数字 JSON number——
 * 首位取 1 保证恒在 2^53 内（message_template_id 载荷形态即 number）。
 */
export function generateWaTemplateId(): number {
  return Number(randomDigits(16, 1));
}

/**
 * Telegram update_id：正整数 JSON number 顺序递增（官方样本 10000，api#update
 * ——「ignore repeated updates or restore the correct update sequence」的
 * 去重幂等键）；取 5 位数与官方样本同量级（首位非零）。
 */
export function generateTgUpdateId(): number {
  return Number(randomDigits(5));
}

/**
 * B站 openid：官方示例为 32 位字母数字混淆串（示例值混入 s/k/x/y 非 hex
 * 字符，事实库「ID 形态」速查）——按小写字母数字形态生成 32 位串。
 */
export function generateBiliOpenId(): string {
  return randomFromChars("0123456789abcdefghijklmnopqrstuvwxyz", 32);
}

/** B站 client_id：官方示例为 16 位小写十六进制串（即 x-bili-accesskeyid）。 */
export function generateBiliClientId(): string {
  return hexChars(16);
}

/**
 * B站 BV 号：官方示例 BV1S9L90H082 明显为占位——BV 号通行形态为 BV + 10 位
 * base58 字母数字（去易混 0、O、I、l），按该字符集生成。
 */
export function generateBiliBvId(): string {
  const body = randomFromChars(
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz",
    10,
  );
  return `BV${body}`;
}

/** B站事件 timestamp：yyyy-MM-dd HH:mm:ss（UTC+8 固定偏移，经 lib/time 封装）。 */
export function generateBiliTimestamp(): string {
  return bilibiliTimestamp();
}
