import { defineSchema } from "../define";
import type { IdGeneration, WirePayload } from "../types";
import { QQ_DEFINITIONS, QQ_EVENT_EXPECTED, qqEnvelope } from "./shared";

/**
 * QQ 关系链两事件（事实库 §2.2/§5.5/§5.6，同属 GROUP_AND_C2C_EVENT 1<<25，
 * 信封见 shared）：官方黄金样本逐字；timestamp 为 Unix 秒数字。
 */

/** 官方黄金样本 §5.5：FRIEND_ADD 事件体（逐字，scene 1001/scene_param 空串） */
const GOLDEN_FRIEND_ADD: WirePayload = {
  openid: "A1B2C3D4E5F6A1B2C3D4",
  timestamp: 1784570523,
  scene: 1001,
  scene_param: "",
  author: {
    union_openid: "DB85A74E07BA08B5B44CD9ED332FCBD2",
  },
};

/** 官方黄金样本 §5.6：GROUP_ADD_ROBOT 事件体（逐字） */
const GOLDEN_GROUP_ADD_ROBOT: WirePayload = {
  group_openid: "A1B2C3D4E5F6A1B2C3D4",
  op_member_openid: "A1B2C3D4E5F6A1B2C3D4",
  timestamp: 1784570534,
};

/** 关系事件的 ID 生成规则：openid 系字段重新生成、Unix 秒时刻按当前秒刷新 */
function relationIdGenerations(paths: {
  openids: string[];
  timestamp: string;
}): IdGeneration[] {
  return [
    ...paths.openids.map((path) => ({ path, kind: "qqOpenId" as const })),
    { path: paths.timestamp, kind: "createTimeSecNumber" as const },
  ];
}

export const QQ_RELATION_SCHEMAS = [
  defineSchema(QQ_DEFINITIONS, "qq-friend-add", {
    eventName: "FRIEND_ADD",
    name: "用户添加好友",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: QQ_EVENT_EXPECTED,
    idGenerations: relationIdGenerations({
      openids: ["d.openid", "d.author.union_openid"],
      timestamp: "d.timestamp",
    }),
    payload: qqEnvelope("FRIEND_ADD", GOLDEN_FRIEND_ADD),
  }),
  defineSchema(QQ_DEFINITIONS, "qq-group-add-robot", {
    eventName: "GROUP_ADD_ROBOT",
    name: "机器人加入群聊",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: QQ_EVENT_EXPECTED,
    // 群 openid 与操作者 openid 为不同实体（官方样本恰为同值，独立生成）
    idGenerations: relationIdGenerations({
      openids: ["d.group_openid", "d.op_member_openid"],
      timestamp: "d.timestamp",
    }),
    payload: qqEnvelope("GROUP_ADD_ROBOT", GOLDEN_GROUP_ADD_ROBOT),
  }),
] as const;
