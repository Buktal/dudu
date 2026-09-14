import dopAuthDefinitions from "../../definitions/douyin/dop-auth.json";
import dopEngagementDefinitions from "../../definitions/douyin/dop-engagement.json";
import imCardDefinitions from "../../definitions/douyin/im-card.json";
import imEventDefinitions from "../../definitions/douyin/im-event.json";
import imReceiveDefinitions from "../../definitions/douyin/im-receive.json";
import isvDefinitions from "../../definitions/douyin/isv.json";
import lifeDefinitions from "../../definitions/douyin/life.json";
import minigameDefinitions from "../../definitions/douyin/minigame.json";
import {
  mergeChannelDefinitions,
  parseChannelDefinition,
} from "../../definitions/loader";
import type { ExpectedReceipt, IdGeneration, WirePayload } from "../types";

/**
 * 抖音渠道协议元数据公共体（四套推送体系共用，事实库 §2）：
 * 载荷与协议事实：docs/research/channels/douyin.md；
 * 字段说明与版本/来源由 ../definitions/douyin/ 八份分体系描述文件
 * 经 loader 装载即校验后合并。新增抖音模板 = 体系模块加一个黄金载荷条目
 * + 对应描述文件分文件加一份字段定义。
 */

/** 版本化字段描述文件：按体系分八份，装载即校验（坏文件启动即炸）后合并 */
export const DOUYIN_DEFINITIONS = mergeChannelDefinitions(
  [
    dopAuthDefinitions,
    dopEngagementDefinitions,
    imReceiveDefinitions,
    imCardDefinitions,
    imEventDefinitions,
    lifeDefinitions,
    minigameDefinitions,
    isvDefinitions,
  ].map((part) => parseChannelDefinition(part)),
);

/** dop 官方成功语义：HTTP 200 判成功（5s 断开 + 重试 3 次），正文不校验 */
export const DOP_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: "",
  bodyMode: "contains",
};

/** 生活服务官方成功语义：HTTP 200 且响应 <2.5s 即成功，正文不校验（重试语义按接口） */
export const LIFE_EXPECTED: ExpectedReceipt = { ...DOP_EXPECTED };

/** 小游戏官方成功语义：验签通过回 HTTP 200 即保存成功，响应体不校验 */
export const MINI_GAME_EXPECTED: ExpectedReceipt = { ...DOP_EXPECTED };

/** 服务商官方成功语义：必须直接返回字符串 success（不带引号），否则重试 3 次 */
export const ISV_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: "success",
  bodyMode: "equals",
};

/** dop 信封三件套的 ID 生成规则（仅对模板载荷中已存在的路径生效） */
export function dyEnvelopeIdGenerations(): IdGeneration[] {
  return [
    { path: "from_user_id", kind: "openId" },
    { path: "to_user_id", kind: "openId" },
    { path: "log_id", kind: "logId" },
  ];
}

/** 信封 + 会话 + 资料的 ID 生成规则（IM 私信消息族共用；
 *  仅对模板载荷中已存在的路径生效，见 applyGeneratedIds） */
export function dyMessageIdGenerations(): IdGeneration[] {
  return [
    ...dyEnvelopeIdGenerations(),
    { path: "content.conversation_short_id", kind: "encryptedId" },
    { path: "content.server_message_id", kind: "encryptedId" },
    { path: "content.create_time", kind: "createTimeMs" },
    {
      path: "content.user_infos[0].open_id",
      kind: "openId",
      sameAs: "from_user_id",
    },
    {
      path: "content.user_infos[1].open_id",
      kind: "openId",
      sameAs: "to_user_id",
    },
  ];
}

/** 官方黄金样本 §5.4：dop 统一信封骨架（空事件骨架，逐字） */
export function dySkeletonEnvelope(
  eventName: string,
  content: WirePayload = {},
): WirePayload {
  return {
    event: eventName,
    client_key: "",
    from_user_id: "",
    to_user_id: "",
    content,
  };
}
