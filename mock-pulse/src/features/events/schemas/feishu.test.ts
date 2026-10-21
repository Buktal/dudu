import { describe, expect, it } from "vitest";

import { wireBodyText } from "../payload";
import { FEISHU_DEFINITIONS, FEISHU_SCHEMAS } from "./feishu";

describe("飞书事件 schema 聚合（Webhook JSON v2.0，握手/验签/加密在 Rust 适配器）", () => {
  it("url_verification 1 + IM 消息 3 + 群组/通讯录/审批 3 = 7 模板，id 全仓库唯一", () => {
    expect(FEISHU_SCHEMAS).toHaveLength(7);
    const ids = FEISHU_SCHEMAS.map((schema) => schema.id);
    expect(new Set(ids).size).toBe(ids.length);
    // 事实库 §2.1：IM 消息 receive/message_read/recalled 三事件
    expect(
      FEISHU_SCHEMAS.filter((schema) => schema.id.startsWith("fs-message")),
    ).toHaveLength(3);
    // 事实库 §2.2–§2.4：bot.added/contact.deleted/approval.updated 三事件
    expect(
      FEISHU_SCHEMAS.filter((schema) =>
        ["fs-bot-added", "fs-contact-deleted", "fs-approval-updated"].includes(
          schema.id,
        ),
      ),
    ).toHaveLength(3);
  });

  it("描述文件分文件合并装载合法，且模板条目与协议模块一一对应", () => {
    expect(FEISHU_DEFINITIONS.channelId).toBe("feishu");
    expect(FEISHU_DEFINITIONS.version).toBe("2026.09");
    expect(Object.keys(FEISHU_DEFINITIONS.schemas).sort()).toEqual(
      FEISHU_SCHEMAS.map((schema) => schema.id).sort(),
    );
  });

  it("报文形态绑定：全部模板走 JSON（v2.0 信封，wire: json）", () => {
    for (const schema of FEISHU_SCHEMAS) {
      expect(schema.wire, `${schema.id} wire`).toBe("json");
      expect(schema.contentString, `${schema.id} contentString`).toBe(false);
    }
  });

  it("默认期望回执 = 渠道真实应答：事件 HTTP 200 无正文（3s 窗口）；握手回 challenge 回显", () => {
    for (const schema of FEISHU_SCHEMAS) {
      if (schema.id === "fs-url-verification") {
        // 事实库 §3.2：1 秒内原样回显 {"challenge":"<同值>"}
        expect(schema.expected).toEqual({
          status: 200,
          body: '{"challenge":"ajls384kdjxxxx"}',
          bodyMode: "jsonField",
        });
        continue;
      }
      // 事实库 §3.3：3 秒内 HTTP 200 即成功，正文不校验
      expect(schema.expected, `${schema.id} expected`).toEqual({
        status: 200,
        body: "",
        bodyMode: "contains",
      });
    }
  });

  it("黄金样本逐字保真：url_verification 三参为官方样本原文（§5.1）", () => {
    const schema = FEISHU_SCHEMAS.find(
      (item) => item.id === "fs-url-verification",
    );
    expect(schema?.payload).toEqual({
      challenge: "ajls384kdjxxxx",
      token: "xxxxxx",
      type: "url_verification",
    });
    if (!schema) return;
    expect(wireBodyText(schema, schema.payload)).toBe(
      '{"challenge":"ajls384kdjxxxx","token":"xxxxxx","type":"url_verification"}',
    );
  });

  it("黄金样本逐字保真：v2.0 信封公共 header 为官方样本原文，仅 event_type 随事件变", () => {
    for (const schema of FEISHU_SCHEMAS) {
      // url_verification 无信封；审批事件官方 header 用 event_create_time
      // 且 token/app_id/tenant_key 为示意填充（§5.8），单独在下方逐字断言
      if (
        schema.id === "fs-url-verification" ||
        schema.id === "fs-approval-updated"
      ) {
        continue;
      }
      expect(schema.payload.header).toEqual({
        event_id: expect.any(String),
        event_type: schema.eventName,
        create_time: "1608725989000",
        token: "rvaYgkND1GOiu5MM0E1rncYC6PLtF7JV",
        app_id: "cli_9f5343c580712544",
        tenant_key: "2ca1d211f64f6438",
      });
      expect(schema.payload.schema).toBe("2.0");
    }
  });

  it("黄金样本逐字保真：接收消息事件体为官方样本原文（§5.4，content 为 JSON 串）", () => {
    const schema = FEISHU_SCHEMAS.find(
      (item) => item.id === "fs-message-receive",
    );
    expect(schema?.payload.event).toEqual({
      sender: {
        sender_id: {
          union_id: "on_8ed6aa67826108097d9ee143816345",
          user_id: "e33ggbyz",
          open_id: "ou_84aad35d084aa403a838cf73ee18467",
        },
        sender_type: "user",
        tenant_key: "736588c9260f175e",
      },
      message: {
        message_id: "om_5ce6d572455d361153b7cb51da133945",
        root_id: "om_5ce6d572455d361153b7cb5xxfsdfsdfdsf",
        parent_id: "om_5ce6d572455d361153b7cb5xxfsdfsdfdsf",
        create_time: "1609073151345",
        update_time: "1687343654666",
        chat_id: "oc_5ce6d572455d361153b7xx51da133945",
        thread_id: "omt_d4be107c616",
        chat_type: "group",
        message_type: "text",
        content: '{"text":"@_user_1 hello"}',
        mentions: [
          {
            key: "@_user_1",
            id: {
              union_id: "on_8ed6aa67826108097d9ee143816345",
              user_id: "e33ggbyz",
              open_id: "ou_84aad35d084aa403a838cf73ee18467",
            },
            mentioned_type: "user",
            name: "Tom",
            tenant_key: "736588c9260f175e",
          },
        ],
        user_agent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.53 Safari/537.36 Lark/6.7.5 LarkLocale/en_US ttnet SDK-Version/6.7.8",
      },
    });
  });

  it("黄金样本逐字保真：已读/撤回事件体为官方样本原文（§5.5/§5.6，真名 message_read/recalled）", () => {
    const payloadOf = (id: string) =>
      FEISHU_SCHEMAS.find((schema) => schema.id === id)?.payload;
    // §5.5 已读：reader + message_id_list
    expect(payloadOf("fs-message-read")?.event).toEqual({
      reader: {
        reader_id: {
          union_id: "on_8ed6aa67826108097d9ee143816345",
          user_id: "e33ggbyz",
          open_id: "ou_84aad35d084aa403a838cf73ee18467",
        },
        read_time: "1609484183000",
        tenant_key: "736588c9260f175e",
      },
      message_id_list: ["om_dc13264520392913993dd051dba21dcf"],
    });
    // §5.6 撤回：message_id/chat_id/recall_time/recall_type
    expect(payloadOf("fs-message-recalled")?.event).toEqual({
      message_id: "om_dc13264520392913993dd051dba21dcf",
      chat_id: "oc_5ad11d72b830411d72b836c20",
      recall_time: "1615380573411",
      recall_type: "message_owner",
    });
  });

  it("黄金样本逐字保真：机器人进群事件体为官方样本原文（§5.9，i18n_names 三语）", () => {
    const schema = FEISHU_SCHEMAS.find((item) => item.id === "fs-bot-added");
    expect(schema?.payload.event).toEqual({
      chat_id: "oc_413871888e0d5492e25b173f0812efb7",
      operator_id: {
        union_id: "on_8ed6aa67826108097d9ee143816345",
        user_id: "e33ggbyz",
        open_id: "ou_84aad35d084aa403a838cf73ee18467",
      },
      external: false,
      operator_tenant_key: "72ud6639",
      name: "Group name testing",
      i18n_names: {
        zh_cn: "群聊",
        en_us: "group chat",
        ja_jp: "グループチャット",
      },
    });
  });

  it("黄金样本逐字保真：员工离职事件体为官方样本原文（§5.7，old_object 为准）", () => {
    const schema = FEISHU_SCHEMAS.find(
      (item) => item.id === "fs-contact-deleted",
    );
    const event = schema?.payload.event as Record<string, unknown>;
    // 官方注明：deleted 事件 department_ids 不返回值，以 old_object.department_ids 为准
    expect(event.object).toMatchObject({
      open_id: "ou_7dab8a3d3cdcc9da365777c7ad535d62",
      union_id: "on_2b832a8c219b087c57208039282c0aa3",
      user_id: "e33ggbyz",
      name: "John",
      email: "zhangsan@gmail.com",
      job_title: "software engineer",
      mobile: "12345678910",
    });
    expect(event.old_object).toEqual({
      department_ids: ["od-4e6ac4d14bcxxxx"],
      open_id: "ou_xxxxxxxxxx",
    });
  });

  it("黄金样本逐字保真：审批定义更新为官方模板结构（§5.8，header 用 event_create_time）", () => {
    const schema = FEISHU_SCHEMAS.find(
      (item) => item.id === "fs-approval-updated",
    );
    expect(schema?.payload).toEqual({
      schema: "2.0",
      header: {
        event_id: "b53e80a132ec090ba249a8bb74da0123",
        token: "ijuh4XAlBSRUIwhBFtLDSfWnIC61234",
        event_type: "approval.approval.updated_v4",
        app_id: "cli_xxx",
        tenant_key: "d6ae59e175fxxx",
        event_create_time: "1502199207.7171419",
      },
      event: {
        object: {
          approval_id: "74333067777841234",
          approval_code: "5B43240B-848C-49BD-9D27-11EF0EE11234",
          version_id: "7459343285667611234",
          widget_group_type: 0,
          form_definition_id: "7459341670005371234",
          process_obj: '{"lineList": xxx}',
          timestamp: "1736763698",
          extra: "",
        },
      },
    });
  });

  it("事件目录对齐官方：url_verification + 六事件真名（message_read/recalled 照录）", () => {
    expect(FEISHU_SCHEMAS.map((schema) => schema.eventName)).toEqual([
      "url_verification",
      "im.message.receive_v1",
      "im.message.message_read_v1",
      "im.message.recalled_v1",
      "im.chat.member.bot.added_v1",
      "contact.user.deleted_v3",
      "approval.approval.updated_v4",
    ]);
  });
});
