import { DOUYIN_DOP_SCHEMAS } from "./douyin/dop";
import { DOUYIN_IM_SCHEMAS } from "./douyin/im";
import { DOUYIN_ISV_SCHEMAS } from "./douyin/isv";
import { DOUYIN_LIFE_SCHEMAS } from "./douyin/life";
import { DOUYIN_MINI_GAME_SCHEMAS } from "./douyin/minigame";
import { DOUYIN_DEFINITIONS } from "./douyin/shared";

/**
 * 抖音渠道协议元数据（四套推送体系聚合，事实库 §2）：
 * - dop 主体系 14 事件（douyin/dop）+ IM 私信明细 11 模板（douyin/im）
 * - 生活服务 2（douyin/life，sha1(AppSecret+去换行 body) 验签）
 * - 小游戏 4（douyin/minigame，x-signature = base64(md5(...)) 验签）
 * - 服务商 2（douyin/isv，{Nonce,TimeStamp,Encrypt,MsgSignature} 信封）
 * 载荷逐字取自 docs/research/channels/douyin.md 核验样本；
 * 字段说明与版本/来源由 definitions/douyin/ 分体系描述文件装载即校验。
 */

export { DOUYIN_DEFINITIONS };

export const DOUYIN_EVENT_SCHEMAS = [
  ...DOUYIN_DOP_SCHEMAS,
  ...DOUYIN_IM_SCHEMAS,
  ...DOUYIN_LIFE_SCHEMAS,
  ...DOUYIN_MINI_GAME_SCHEMAS,
  ...DOUYIN_ISV_SCHEMAS,
] as const;
