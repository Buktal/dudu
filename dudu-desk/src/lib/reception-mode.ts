export const receptionModes = {
  calm: { name: "自在", description: "熟悉的聊天式接待" },
  parallel: { name: "并肩", description: "主接待与一位固定来访用户" },
  quick: { name: "速答", description: "先看问题，就地回复" },
} as const;

export type ReceptionMode = keyof typeof receptionModes;
export const receptionModeKeys = Object.keys(receptionModes) as ReceptionMode[];

export function isReceptionMode(value: unknown): value is ReceptionMode {
  return receptionModeKeys.some((key) => key === value);
}
