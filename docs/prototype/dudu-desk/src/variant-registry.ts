export const variantKeys = ["A", "C", "D", "E"] as const;
export const variants = {
  A: {
    number: "1",
    name: "自在",
    description: "熟悉的聊天式接待",
    angle: "会话列表常驻，一眼扫过全部来访。",
    benefit: "上手门槛低，适合频繁在熟悉访客之间切换。",
    question: "用户反馈：传统、可接受，继续保留。",
  },
  C: {
    number: "3",
    name: "并肩",
    description: "主接待 + 一位固定访客",
    angle:
      "左窗跟随会话列表，右窗由你手动固定。等待一位补充信息时，继续回复另一位。",
    benefit: "两个窗口各有草稿；可随时收起右窗，再从任一会话“并排打开”。",
    question: "用户反馈：新奇、可接受。本轮补清双窗规则。",
  },
  D: {
    number: "4",
    name: "折页",
    description: "就在会话行里展开聊天",
    angle: "所有访客是一张清晰的清单，点击哪一行，对话就在哪一行展开。",
    benefit: "名单和聊天不用来回找位置；收起对话后，立即回到整张清单。",
    question: "展开式接待能否减少寻找窗口的负担？",
  },
  E: {
    number: "5",
    name: "速答",
    description: "先看问题，就地回复",
    angle: "每位访客的最新来信变成一张消息卡，直接在卡片上短回复。",
    benefit: "简单问题直接答，需要更多上下文时再打开完整对话。",
    question: "短咨询集中到来时，这种方式是否更快看清并回复？",
  },
};
