import {
  mergeChannelDefinitions,
  parseChannelDefinition,
} from "../../definitions/loader";
import arkDefinitions from "../../definitions/xiaohongshu/xiaohongshu-ark.json";
import miniappDefinitions from "../../definitions/xiaohongshu/xiaohongshu-miniapp.json";
import type { ExpectedReceipt, IdGeneration, WirePayload } from "../types";

/**
 * 小红书渠道协议元数据公共体（事实库 docs/research/channels/xiaohongshu.md，
 * 双体系：小程序客服消息 + 电商 ark 推送）：
 * - 小程序客服消息（§10 [官方]）：JSON 载荷，通用字段 MsgId/FromOpenId/ToAppId/
 *   MsgType/CreateTime + 按 MsgType 追加专属字段；GET 四参握手（§10.4 三参
 *   sha1 排序验签 + 原样回 echostr）；推送信封 {Nonce,Timestamp,Encrypt,
 *   MsgSignature} 在 body 内（§11.2），AES 与微信同族（§11.3 官方 MsgDecrypt
 *   源码实锤：密钥派生/IV/PKCS#7-32/明文尾部 appId）——加密封装由 Rust 适配器
 *   复用企微 crypto 原语完成，模板只持有解密后明文
 * - 电商 ark 推送（§2 [多源]）：平台 POST body 为 [{msgTag,sellerId,data}]
 *   JSON 数组（批量推送），data 为内层业务 JSON 序列化字符串（二级转义，
 *   §2.2 明示字段命名不统一应保留原样）；明文数组直发由 Rust 适配器完成
 *   （§3.7 两 SDK 均未展示推送侧签名头，无验签）
 * 字段说明与版本/来源由 definitions/xiaohongshu/ 分域描述文件装载即校验后合并。
 */

/** 版本化字段描述文件：按体系分两份，装载即校验（坏文件启动即炸）后合并 */
export const XHS_DEFINITIONS = mergeChannelDefinitions(
  [miniappDefinitions, arkDefinitions].map((part) =>
    parseChannelDefinition(part),
  ),
);

/**
 * 小程序客服消息的官方应答（事实库 §10.5）：收到推送必须直接回复
 * `success`（官方推荐，不带引号），否则 5 秒超时断开并重发（共 3 次）——
 * 期望按逐字相等声明。
 */
export const XHS_MINIAPP_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: "success",
  bodyMode: "equals",
};

/**
 * 电商 ark 推送的官方应答（事实库 §2.1/§5.4）：HTTP 200 +
 * `{"success":true,"error_code":0,"error_msg":""}`——期望按 JSON 字段子集
 * 声明（error_msg 等额外字段允许存在）。
 */
export const XHS_ARK_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: '{"success":true,"error_code":0}',
  bodyMode: "jsonField",
};

/**
 * 小程序客服消息通用字段骨架（事实库 §10.3 官方样本逐字：占位值 MSG_ID/
 * USER_OPEN_ID/SELLER_APP_ID、CreateTime=1648714429 照录）：
 * 键序 = 通用五字段在前、按 MsgType 追加的专属字段殿后。
 */
export function xhsMessageEnvelope(
  msgType: string,
  specific: WirePayload,
): WirePayload {
  return {
    MsgId: "MSG_ID",
    FromOpenId: "USER_OPEN_ID",
    ToAppId: "SELLER_APP_ID",
    MsgType: msgType,
    CreateTime: 1648714429,
    ...specific,
  };
}

/**
 * 骨架的 ID 生成规则：MsgId 按字符串口径重生成（官方无格式样本，取微信系
 * int64 同族数字串）、CreateTime 按当前秒级时刻重生成（排重键）。
 */
export function xhsMessageIdGenerations(): IdGeneration[] {
  return [
    { path: "MsgId", kind: "xhsMsgId" },
    { path: "CreateTime", kind: "createTimeSecNumber" },
  ];
}

/**
 * PAY_RESULT 的 ID 生成规则（事实库 §11.1）：PayTime 秒级时刻重生成；
 * 订单/券码占位为掩码风格构造值（官方无样本），不做生成。
 */
export function xhsPayResultIdGenerations(): IdGeneration[] {
  return [{ path: "PayTime", kind: "createTimeSecNumber" }];
}

/**
 * ark 推送信封骨架（事实库 §2.1 字段名逐字：msgTag/sellerId/data）：
 * data 为内层业务 JSON 序列化字符串（二级转义），由调用方传入。
 */
export function xhsArkEnvelope(msgTag: string, data: string): WirePayload {
  return {
    msgTag,
    sellerId: "5e8e****",
    data,
  };
}
