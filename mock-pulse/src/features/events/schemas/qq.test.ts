import { describe, expect, it } from "vitest";

import { generateQqOpenId, generateQqRobotMsgId } from "../ids";
import { QQ_DEFINITIONS, QQ_SCHEMAS } from "./qq";

describe("QQ 事件 schema 聚合（Webhook 子形态，Ed25519 验签/op13 回包校验在 Rust 适配器）", () => {
  it("op13 验证回调 1 + 单聊/群消息 3 + 频道消息 2 + 关系链 2 = 8 模板，id 全仓库唯一", () => {
    expect(QQ_SCHEMAS).toHaveLength(8);
    const ids = QQ_SCHEMAS.map((schema) => schema.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("qq-"))).toBe(true);
  });

  it("描述文件分文件合并装载合法，且模板条目与协议模块一一对应", () => {
    expect(QQ_DEFINITIONS.channelId).toBe("qq");
    expect(QQ_DEFINITIONS.version).toBe("2026.09");
    expect(Object.keys(QQ_DEFINITIONS.schemas).sort()).toEqual(
      QQ_SCHEMAS.map((schema) => schema.id).sort(),
    );
  });

  it("报文形态绑定：全部模板走 JSON（信封解密前的线上明文，wire: json）", () => {
    for (const schema of QQ_SCHEMAS) {
      expect(schema.wire, `${schema.id} wire`).toBe("json");
      expect(schema.contentString, `${schema.id} contentString`).toBe(false);
    }
  });

  it("默认期望回执 = 渠道真实应答：普通事件只看 HTTP 200（op12 ACK 无回包体口径）；op13 验签回包", () => {
    for (const schema of QQ_SCHEMAS) {
      if (schema.id === "qq-op13-verify") {
        // 事实库 §3.2：{plain_token 回显, signature=hex(Ed25519)}，适配器验签
        expect(schema.expected, `${schema.id} expected`).toEqual({
          status: 200,
          body: "Arq0D5A61EgUu4OxUvOp",
          bodyMode: "qqSignReply",
        });
        continue;
      }
      // 事实库 §3.1/§7.1：op12 只定义「代表机器人收到了平台推送的数据」，
      // 回包体格式官方无口径 → 只看状态码
      expect(schema.expected, `${schema.id} expected`).toEqual({
        status: 200,
        body: "",
        bodyMode: "contains",
      });
    }
  });

  it("事件信封为官方通用形态（§5.1 逐字：id 官方占位符 event_id、op=0、s=42、t=事件名）", () => {
    for (const schema of QQ_SCHEMAS) {
      if (schema.id === "qq-op13-verify") continue;
      expect(schema.payload.id, `${schema.id} 信封 id`).toBe("event_id");
      expect(schema.payload.op, `${schema.id} 信封 op`).toBe(0);
      expect(schema.payload.s, `${schema.id} 信封 s`).toBe(42);
      expect(schema.payload.t, `${schema.id} 信封 t`).toBe(schema.eventName);
      expect(Object.keys(schema.payload)).toEqual(["id", "op", "d", "s", "t"]);
    }
  });

  it("op13 黄金样本逐字保真：官方验证回调请求体（§3.2，d 在前 op 在后）", () => {
    const schema = QQ_SCHEMAS.find((item) => item.id === "qq-op13-verify");
    expect(schema?.payload).toEqual({
      d: { plain_token: "Arq0D5A61EgUu4OxUvOp", event_ts: "1725442341" },
      op: 13,
    });
    // event_ts 新建时按当前秒刷新（签名对新值仍自洽），plain_token 照录官方样本
    expect(schema?.idGenerations).toEqual([
      { path: "d.event_ts", kind: "createTimeSec" },
    ]);
  });

  it("黄金样本逐字保真：C2C 单聊消息为官方全量样本（§5.3，含官方占位符原文）", () => {
    const schema = QQ_SCHEMAS.find(
      (item) => item.id === "qq-c2c-message-create",
    );
    expect(schema?.payload.d).toEqual({
      id: "ROBOT1.0_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      author: {
        id: "A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4",
        user_openid: "A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4",
        union_openid: "",
        username: "",
        bot: false,
      },
      content: "你好，今天有什么推荐的活动吗？",
      message_type: 0,
      message_scene: {
        source: "default",
        ext: ["msg_idx=REFIDX_xxxxxxxxxxxxxxx=="],
      },
      timestamp: "2026-07-21T10:00:00+08:00",
    });
  });

  it("黄金样本逐字保真：群 @ 消息为官方全量样本（§5.4，content 前空格与首尾空格照录）", () => {
    const schema = QQ_SCHEMAS.find(
      (item) => item.id === "qq-group-at-message-create",
    );
    expect(schema?.payload.d).toEqual({
      id: "ROBOT1.0_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      author: {
        id: "A1B2C3D4E5F6A1B2C3D4",
        member_openid: "A1B2C3D4E5F6A1B2C3D4",
        member_role: "member",
        username: "小明",
        bot: false,
      },
      content: " /今日天气 ",
      group_openid: "B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5",
      message_type: 0,
      timestamp: "2026-07-21T10:00:00+08:00",
      message_scene: {
        source: "default",
        ext: [
          "msg_idx=REFIDX_xxxxxxxxxxxxxxx==",
          "auth_token=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        ],
      },
    });
  });

  it("群全量消息按事实库 §5.12 组合：GROUP_AT 字段语义 + 示例 1 文本 + mentions 空列表", () => {
    const schema = QQ_SCHEMAS.find(
      (item) => item.id === "qq-group-message-create",
    );
    const groupAt = QQ_SCHEMAS.find(
      (item) => item.id === "qq-group-at-message-create",
    );
    // 与 GROUP_AT 完全一致的字段照录（author 结构逐字），差异只在 content/mentions
    expect(schema?.payload.d).toEqual({
      ...(groupAt?.payload.d as object),
      content: "大家早上好呀",
      mentions: [],
    });
  });

  it("黄金样本逐字保真：频道 AT 消息为官方 Message 对象（§5.7，含 seq/joined_at）", () => {
    const schema = QQ_SCHEMAS.find(
      (item) => item.id === "qq-at-message-create",
    );
    expect(schema?.payload.d).toEqual({
      author: {
        avatar: "http://thirdqq.qlogo.cn/0",
        bot: false,
        id: "1234",
        username: "abc",
      },
      channel_id: "100010",
      content: "ndnnd",
      guild_id: "18700000000001",
      id: "0812345677890abcdef",
      member: {
        joined_at: "2021-04-12T16:34:42+08:00",
        roles: ["1"],
      },
      timestamp: "2021-05-20T15:14:58+08:00",
      seq: 101,
    });
  });

  it("频道私信按 Message 对象同构照录（事实库仅 Intent + 语义级，无逐字事件体）", () => {
    const direct = QQ_SCHEMAS.find(
      (item) => item.id === "qq-direct-message-create",
    );
    const at = QQ_SCHEMAS.find((item) => item.id === "qq-at-message-create");
    // d 结构与 AT 样本同构逐字（不编造其余字段），仅信封 t 不同
    expect(direct?.payload.d).toEqual(at?.payload.d);
    expect(direct?.payload.t).toBe("DIRECT_MESSAGE_CREATE");
  });

  it("黄金样本逐字保真：关系链两事件（§5.5/§5.6，Unix 秒数字时刻）", () => {
    const payloadOf = (id: string) =>
      QQ_SCHEMAS.find((schema) => schema.id === id)?.payload.d;
    expect(payloadOf("qq-friend-add")).toEqual({
      openid: "A1B2C3D4E5F6A1B2C3D4",
      timestamp: 1784570523,
      scene: 1001,
      scene_param: "",
      author: {
        union_openid: "DB85A74E07BA08B5B44CD9ED332FCBD2",
      },
    });
    expect(payloadOf("qq-group-add-robot")).toEqual({
      group_openid: "A1B2C3D4E5F6A1B2C3D4",
      op_member_openid: "A1B2C3D4E5F6A1B2C3D4",
      timestamp: 1784570534,
    });
  });

  it("ID 生成器官方形态：ROBOT1.0_ + 56 位字母数字；openid 32 位大写十六进制", () => {
    const msgId = generateQqRobotMsgId();
    expect(msgId).toMatch(/^ROBOT1\.0_[A-Za-z0-9]{56}$/);
    expect(generateQqRobotMsgId()).not.toBe(msgId);

    const openId = generateQqOpenId();
    expect(openId).toMatch(/^[0-9A-F]{32}$/);
  });

  it("消息/关系事件的 ID 生成规则锚定 d.* 路径且 kind 官方形态", () => {
    const generationsOf = (id: string) =>
      QQ_SCHEMAS.find((schema) => schema.id === id)?.idGenerations;
    // 单聊：d.id ROBOT1.0 + author.id/user_openid 同值（官方样本一致）
    expect(generationsOf("qq-c2c-message-create")).toEqual([
      { path: "d.id", kind: "qqRobotMsgId" },
      { path: "d.author.id", kind: "qqOpenId" },
      {
        path: "d.author.user_openid",
        kind: "qqOpenId",
        sameAs: "d.author.id",
      },
    ]);
    // 关系链：openid 重新生成 + Unix 秒时刻刷新
    expect(generationsOf("qq-friend-add")).toEqual([
      { path: "d.openid", kind: "qqOpenId" },
      { path: "d.author.union_openid", kind: "qqOpenId" },
      { path: "d.timestamp", kind: "createTimeSecNumber" },
    ]);
  });

  it("事件目录：真名事件 + op13 操作码（载荷无 t 字段）", () => {
    expect(QQ_SCHEMAS.map((schema) => schema.eventName)).toEqual([
      "op13",
      "C2C_MESSAGE_CREATE",
      "GROUP_AT_MESSAGE_CREATE",
      "GROUP_MESSAGE_CREATE",
      "AT_MESSAGE_CREATE",
      "DIRECT_MESSAGE_CREATE",
      "FRIEND_ADD",
      "GROUP_ADD_ROBOT",
    ]);
    expect(QQ_SCHEMAS.map((schema) => schema.kind)).toEqual([
      "event",
      "message",
      "message",
      "message",
      "message",
      "message",
      "event",
      "event",
    ]);
  });
});
