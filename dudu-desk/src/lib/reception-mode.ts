export const receptionModes = {
  calm: { name: "专注", description: "一次查看一段完整对话。" },
  parallel: { name: "并排", description: "左侧切换会话，右侧固定访客。" },
  quick: { name: "卡片", description: "多位访客同屏，直接在卡片回复。" },
} as const;

export type ReceptionMode = keyof typeof receptionModes;
export const receptionModeKeys = Object.keys(receptionModes) as ReceptionMode[];

export function isReceptionMode(value: unknown): value is ReceptionMode {
  return receptionModeKeys.some((key) => key === value);
}
