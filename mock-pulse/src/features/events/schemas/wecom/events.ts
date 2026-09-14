import { defineSchema } from "../define";
import type { WirePayload, XmlLayout } from "../types";
import {
  WECOM_DEFINITIONS,
  WECOM_EXPECTED,
  wcChangeContactLayout,
  wcEventEnvelope,
  wcEventIdGenerations,
  wcEventLayout,
} from "./shared";

/**
 * 企微自建应用事件字典 · 订阅/会话/位置/异步任务/通讯录
 * （事实库 §2.2 事件目录 + §5.3/§5.4 官方黄金样本，逐字）：
 * subscribe / unsubscribe / enter_agent / LOCATION / batch_job_result / change_contact。
 * 有官方样本的事件逐字复刻（subscribe、enter_agent、change_contact=create_user）；
 * 其余按 §2.2 字段表构造。事件推送不携带 MsgId。
 */

/** 官方黄金样本 §5.3：subscribe 事件（逐字） */
const goldenWcSubscribe: WirePayload = {
  ToUserName: "toUser",
  FromUserName: "UserID",
  CreateTime: "1348831860",
  MsgType: "event",
  Event: "subscribe",
  AgentID: "1",
};

/** LOCATION 专有排版：位置数值为裸文本（官方位置类样本不带 CDATA） */
const wcLocationLayout: XmlLayout = {
  indent: "\t",
  bareTags: ["CreateTime", "Latitude", "Longitude", "Precision", "AgentID"],
};

/** 官方黄金样本 §5.4：create_user 通讯录事件（逐字；ExtAttr 为嵌套结构原文片段） */
const goldenWcChangeContact: WirePayload = {
  ToUserName: "toUser",
  FromUserName: "sys",
  CreateTime: "1403610513",
  MsgType: "event",
  Event: "change_contact",
  ChangeType: "create_user",
  UserID: "zhangsan",
  Name: "张三",
  Department: "1,2,3",
  MainDepartment: "1",
  IsLeaderInDept: "1,0,0",
  DirectLeader: "lisi,wangwu",
  Position: "产品经理",
  Mobile: "13800000000",
  Gender: "1",
  Email: "zhangsan@gzdev.com",
  BizMail: "zhangsan@qyycs2.wecom.work",
  Status: "1",
  Avatar:
    "http://wx.qlogo.cn/mmopen/ajNVdqHZLLA3WJ6DSZUfiakYe37PKnQhBIeOQBO4czqrnZDS79FH5Wm5m4X69TBicnHFlhiafvDwklOpZeXYQQ2icg/0",
  Alias: "zhangsan",
  Telephone: "020-123456",
  Address: "广州市",
  ExtAttr: [
    "<ExtAttr>",
    "\t\t<Item>",
    "\t\t<Name><![CDATA[爱好]]></Name>",
    "\t\t<Type>0</Type>",
    "\t\t<Text>",
    "\t\t\t<Value><![CDATA[旅游]]></Value>",
    "\t\t</Text>",
    "\t\t</Item>",
    "\t\t<Item>",
    "\t\t<Name><![CDATA[卡号]]></Name>",
    "\t\t<Type>1</Type>",
    "\t\t<Web>",
    "\t\t\t<Title><![CDATA[企业微信]]></Title>",
    "\t\t\t<Url><![CDATA[https://work.weixin.qq.com]]></Url>",
    "\t\t</Web>",
    "\t\t</Item>",
    "\t</ExtAttr>",
  ].join("\n"),
};

export const WECOM_AGENT_CORE_EVENT_SCHEMAS = [
  defineSchema(WECOM_DEFINITIONS, "wc-subscribe", {
    eventName: "subscribe",
    name: "成员关注应用",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: goldenWcSubscribe,
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-unsubscribe", {
    eventName: "unsubscribe",
    name: "成员取消关注",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: { ...goldenWcSubscribe, Event: "unsubscribe" },
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-enter", {
    eventName: "enter_agent",
    name: "进入应用会话",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcEventEnvelope("enter_agent", { EventKey: "" }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-location-report", {
    eventName: "LOCATION",
    name: "上报地理位置",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcLocationLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcEventEnvelope("LOCATION", {
      Latitude: "23.137466",
      Longitude: "113.352425",
      Precision: "119.385040",
      AppType: "wxwork",
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-batch-job-result", {
    eventName: "batch_job_result",
    name: "异步任务完成",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcEventEnvelope("batch_job_result", {
      BatchJob:
        "<BatchJob><JobId><![CDATA[BATCH_JOB_ID]]></JobId><JobType><![CDATA[sync_user]]></JobType><ErrCode>0</ErrCode><ErrMsg><![CDATA[ok]]></ErrMsg></BatchJob>",
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-change-contact", {
    eventName: "change_contact",
    name: "通讯录变更 · 新增成员",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcChangeContactLayout,
    idGenerations: wcEventIdGenerations(),
    payload: goldenWcChangeContact,
  }),
] as const;
