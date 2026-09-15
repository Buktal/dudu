import { describe, expect, it } from "vitest";

import { parseWireDraft, wireBodyText } from "../payload";
import { DINGTALK_DEFINITIONS, DINGTALK_SCHEMAS } from "./dingtalk";

describe("钉钉事件 schema 聚合（新 HTTP 密文信封 + 机器人明文通道，验签/加密在 Rust 适配器）", () => {
  it("回调握手 4 + 审批 2 + 通讯录 2 + 机器人 6 = 14 模板，id 全仓库唯一", () => {
    expect(DINGTALK_SCHEMAS).toHaveLength(14);
    const ids = DINGTALK_SCHEMAS.map((schema) => schema.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      DINGTALK_SCHEMAS.filter((schema) => schema.id.startsWith("dt-bot-")),
    ).toHaveLength(6);
    expect(
      DINGTALK_SCHEMAS.filter((schema) => schema.id.startsWith("dt-")),
    ).toHaveLength(14);
  });

  it("描述文件分文件合并装载合法，且模板条目与协议模块一一对应", () => {
    expect(DINGTALK_DEFINITIONS.channelId).toBe("dingtalk");
    expect(DINGTALK_DEFINITIONS.version).toBe("2026.09");
    expect(Object.keys(DINGTALK_DEFINITIONS.schemas).sort()).toEqual(
      DINGTALK_SCHEMAS.map((schema) => schema.id).sort(),
    );
  });

  it("报文形态绑定：全部模板走 JSON（明文/信封解密后形态，wire: json）", () => {
    for (const schema of DINGTALK_SCHEMAS) {
      expect(schema.wire, `${schema.id} wire`).toBe("json");
      expect(schema.contentString, `${schema.id} contentString`).toBe(false);
    }
  });

  it("每个字段都有标题/类型/分组/解释", () => {
    for (const schema of DINGTALK_SCHEMAS) {
      for (const field of schema.fields) {
        expect(field.title, `${schema.id}.${field.path} title`).toBeTruthy();
        expect(field.type, `${schema.id}.${field.path} type`).toBeTruthy();
        expect(field.group, `${schema.id}.${field.path} group`).toBeTruthy();
        expect(
          field.description,
          `${schema.id}.${field.path} description`,
        ).toBeTruthy();
      }
    }
  });

  it("默认期望回执 = 渠道真实应答：密文事件回加密 success 包（1500ms）；机器人仅校验 HTTP 200", () => {
    for (const schema of DINGTALK_SCHEMAS) {
      if (schema.id.startsWith("dt-bot-")) {
        // 事实库 §3.3：官方未定义机器人回包语义
        expect(schema.expected, `${schema.id} expected`).toEqual({
          status: 200,
          body: "",
          bodyMode: "contains",
        });
        continue;
      }
      // 事实库 §5.10：1500ms 内回 {"msg_signature","timeStamp","nonce","encrypt":enc("success")}
      expect(schema.expected, `${schema.id} expected`).toEqual({
        status: 200,
        body: "success",
        bodyMode: "dingtalkReply",
      });
    }
  });

  it("模板载荷逐字节自反：线上 JSON ↔ 载荷解析往返一致", () => {
    for (const schema of DINGTALK_SCHEMAS) {
      const text = wireBodyText(schema, schema.payload);
      const parsed = parseWireDraft(schema, text);
      expect(parsed, `${schema.id} 往返载荷`).toEqual(schema.payload);
      expect(wireBodyText(schema, parsed), `${schema.id} 往返明文`).toBe(text);
    }
  });

  it("黄金样本逐字保真：回调握手系为官方解密后明文（§5.6，含 suite_ticket 数字型 TimeStamp）", () => {
    const payloadOf = (id: string) =>
      DINGTALK_SCHEMAS.find((schema) => schema.id === id)?.payload;
    expect(payloadOf("dt-check-url")).toEqual({ EventType: "check_url" });
    expect(payloadOf("dt-check-create-suite-url")).toEqual({
      EventType: "check_create_suite_url",
      Random: "brdkKLMW",
    });
    expect(payloadOf("dt-check-update-suite-url")).toEqual({
      EventType: "check_update_suite_url",
      Random: "xxxxxx",
      TestSuiteKey: "suited6db0pze8yao1b1y",
    });
    expect(payloadOf("dt-suite-ticket")).toEqual({
      SuiteKey: "xxxxxx",
      EventType: "suite_ticket",
      TimeStamp: 123456,
      SuiteTicket: "xxxxxx",
    });
  });

  it("黄金样本逐字保真：审批双信封为大写 HTTP 形态 + 官方业务字段（§5.4）", () => {
    const payloadOf = (id: string) =>
      DINGTALK_SCHEMAS.find((schema) => schema.id === id)?.payload;
    // 公共信封值（事实库 §5.2/§5.3 HTTP 样本逐字）
    expect(payloadOf("dt-bpms-instance-change")).toEqual({
      EventType: "bpms_instance_change",
      EventTime: 1663143335567,
      CorpId: "ding9f50b15bxxxx16741",
      BizId: "1663**35567",
      eventId: "c7c7120f2c07419**ebdba0318c8",
      result: "agree",
      processInstanceId: "9Qgx5QqjR7axMwxxxx",
      finishTime: 1495592272000,
      createTime: 1495592305000,
      processCode: "Pro-xxx",
      bizCategoryId: "20230xxx",
      businessId: "yewu1",
      type: "finish",
      title: "自测-1016",
      businessType: "yewu1",
      url: "https://aflow.dingtalk.com/dingtalk/mobile/homepage.htm?corpid=ding2c015874d817xxxx&dd_share=",
      staffId: "manager75",
    });
    expect(payloadOf("dt-bpms-task-change")).toEqual({
      EventType: "bpms_task_change",
      EventTime: 1663143335567,
      CorpId: "ding9f50b15bxxxx16741",
      BizId: "1663**35567",
      eventId: "c7c7120f2c07419**ebdba0318c8",
      result: "agree",
      processInstanceId: "ce133dd0-5b22-9516-xxxxxxxxxxxx",
      finishTime: 1670983893000,
      createTime: 1670983873000,
      processCode: "PROC-27BBC5E6-DFFA-4EC3-A1F1-xxx",
      bizCategoryId: "attendance.goout",
      businessId: "20xxxx38",
      remark: "同意",
      type: "finish",
      title: "考勤-测试",
      taskId: 811165,
      staffId: "08058646137",
    });
  });

  it("黄金样本逐字保真：通讯录双信封为官方 HTTP 形态（§5.2/§5.3，diffInfo 与字符串型 timeStamp）", () => {
    const payloadOf = (id: string) =>
      DINGTALK_SCHEMAS.find((schema) => schema.id === id)?.payload;
    expect(payloadOf("dt-user-modify-org")).toEqual({
      EventType: "user_modify_org",
      EventTime: 1663143335567,
      CorpId: "ding9f50b15bxxxx16741",
      BizId: "1663**35567",
      eventId: "c7c7120f2c07419**ebdba0318c8",
      timeStamp: "1608017258073",
      diffInfo: {
        prev: {
          managerUserid: "205xxx91",
          hiredDate: "20xx-xx-xx",
          name: "测试01",
          telephone: "1234",
          email: "xxx@xx.com",
          jobNumber: "112x422",
          workPlace: "北京",
        },
        curr: {
          managerUserid: "205xxx91",
          hiredDate: "20xx-xx-xx",
          name: "测试1",
          email: "xxx@xx.com",
          jobNumber: "112x422",
          workPlace: "北京",
        },
        userid: "user123456",
      },
      userId: ["user123456"],
    });
    expect(payloadOf("dt-user-leave-org")).toEqual({
      EventType: "user_leave_org",
      EventTime: 1663143335567,
      CorpId: "ding9f50b15bxxxx16741",
      BizId: "1663**35567",
      eventId: "c7c7120f2c07419**ebdba0318c8",
      timeStamp: "1685501863357",
      userId: ["015xxxx227"],
    });
  });

  it("黄金样本逐字保真：机器人收文本消息为官方全量样本（§5.1，23 键含掩码原文）", () => {
    const schema = DINGTALK_SCHEMAS.find((item) => item.id === "dt-bot-text");
    expect(schema?.payload).toEqual({
      senderPlatform: "Mac",
      conversationId: "cid6EUvB2O8qVF2RYQtHTKEsg==",
      atUsers: [
        {
          dingtalkId: "$:LWCP_v1:$PcdFk0c1XakTWLPSQCaVcRzxeEVV3pr5",
        },
      ],
      chatbotCorpId: "ding9733d095*******6cb783455b",
      chatbotUserId: "$:LWCP_v1:$PcdFk0c1XakTWLPSQCaVcRzxeEVV3pr5",
      msgId: "msgrK2ckHkMbaiUWt5xQU+riw==",
      senderNick: "小钉",
      isAdmin: true,
      senderStaffId: "014728255240768602",
      sessionWebhookExpiredTime: 1708332604316,
      createAt: 1708327204136,
      senderCorpId: "ding9733d095*******6cb783455b",
      conversationType: "2",
      senderId: "$:LWCP_v1:$6GYsn+zrv5WZ77xc2v4zsyXfBv1MhAv9",
      conversationTitle: "测试群",
      isInAtList: true,
      sessionWebhook:
        "https://oapi.dingtalk.com/robot/sendBySession?session=66d7c695a9e1f18782a7cba1d9deb885",
      text: { content: " text" },
      robotCode: "dingohropvkloy0xdm3k",
      msgtype: "text",
    });
  });

  it("黄金样本逐字保真：其余 5 msgtype 为官方样本信封 + 官方片段（downloadCode 截断占位照录）", () => {
    const contentOf = (id: string) => {
      const schema = DINGTALK_SCHEMAS.find((item) => item.id === id);
      expect(schema?.payload.msgtype, id).toBe(schema?.eventName);
      return schema?.payload.content;
    };
    expect(contentOf("dt-bot-picture")).toEqual({
      downloadCode: "mIofN681YE3f/…",
    });
    expect(contentOf("dt-bot-audio")).toEqual({
      duration: 4000,
      downloadCode: "mIofN…",
      recognition: "钉钉，让进步发生",
    });
    expect(contentOf("dt-bot-video")).toEqual({
      duration: 4000,
      downloadCode: "mIofN…",
      videoType: "mp4",
    });
    expect(contentOf("dt-bot-file")).toEqual({
      downloadCode: "mIofN…",
      fileName: "钉钉让进步发生.pdf",
    });
    expect(contentOf("dt-bot-richtext")).toEqual({
      richText: [{ text: "你好" }, { downloadCode: "mIofN…", type: "picture" }],
    });
    // 非文本模板与 text 模板共用同一份官方信封字段（逐字）
    const text = DINGTALK_SCHEMAS.find((item) => item.id === "dt-bot-text");
    for (const id of [
      "dt-bot-picture",
      "dt-bot-audio",
      "dt-bot-video",
      "dt-bot-file",
      "dt-bot-richtext",
    ]) {
      const other = DINGTALK_SCHEMAS.find((item) => item.id === id);
      const { content: _c, msgtype: _m, ...rest } = other?.payload ?? {};
      const { text: _t, msgtype: _tm, ...textRest } = text?.payload ?? {};
      expect(rest, id).toEqual(textRest);
    }
  });

  it("事件目录：密文信封事件用官方 EventType 真名，机器人模板用官方 msgtype 真名", () => {
    expect(DINGTALK_SCHEMAS.map((schema) => schema.eventName)).toEqual([
      "check_url",
      "check_create_suite_url",
      "check_update_suite_url",
      "suite_ticket",
      "bpms_instance_change",
      "bpms_task_change",
      "user_modify_org",
      "user_leave_org",
      "text",
      "picture",
      "audio",
      "video",
      "file",
      "richText",
    ]);
  });
});
