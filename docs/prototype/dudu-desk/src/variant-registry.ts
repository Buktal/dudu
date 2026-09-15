export const variantKeys = ["A", "C", "E"] as const;
export const variants = {
  A: {
    number: "1",
    name: "自在",
    description: "熟悉的聊天式接待",
    angle: "会话列表常驻，一眼扫过全部来访。",
    benefit: "上手门槛低，适合频繁在熟悉访客之间切换。",
    useWhen: "专心接待一位访客，或在熟悉的会话之间切换。",
  },
  C: {
    number: "3",
    name: "并肩",
    description: "主接待 + 一位固定访客",
    angle:
      "左窗跟随会话列表，右窗由你手动固定。等待一位补充信息时，继续回复另一位。",
    benefit: "两个窗口各有草稿；可随时收起右窗，再从任一会话“并排打开”。",
    useWhen: "一边等待访客补充信息，一边跟进另一段对话。",
  },
  E: {
    number: "5",
    name: "速答",
    description: "先看问题，就地回复",
    angle: "每位访客的最新来信变成一张消息卡，直接在卡片上短回复。",
    benefit: "简单问题直接答，需要更多上下文时再打开完整对话。",
    useWhen: "简单咨询集中到来，需要快速浏览并逐个回复。",
  },
};
