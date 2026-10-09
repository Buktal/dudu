// The eight selected palettes keep existing ids for saved theme preferences.
export const palettes = {
  daylight: {
    name: "极昼白",
    description: "清白底色 · 分层灰阶",
    scheme: "light",
  },
  midnight: {
    name: "极夜黑",
    description: "中性炭灰 · 灰色气泡",
    scheme: "dark",
  },
  crimson: {
    name: "栗木红",
    description: "暖红棕 · 柔和浅底",
    scheme: "light",
  },
  amber: { name: "麦穗金", description: "米金 · 柔和暖意", scheme: "light" },
  citrus: {
    name: "草木绿",
    description: "柔和草绿 · 清楚自然",
    scheme: "light",
  },
  ocean: { name: "牛仔蓝", description: "灰调蓝 · 清楚沉静", scheme: "light" },
  iris: { name: "烟岚紫", description: "灰调紫 · 柔和安静", scheme: "light" },
  oat: { name: "亚麻褐", description: "米褐 · 接近中性", scheme: "light" },
} as const;

export type Palette = keyof typeof palettes;
export const paletteKeys = Object.keys(palettes) as Palette[];

export function isPalette(value: unknown): value is Palette {
  return paletteKeys.some((key) => key === value);
}

export function restorePalette(value: unknown): Palette | undefined {
  // Retired themes restore to the closest retained color family.
  switch (value) {
    case "apricot":
    case "berry":
      return "crimson";
    case "pine":
      return "citrus";
    case "sea":
      return "ocean";
    case "graphite":
    case "fog":
      return "daylight";
    default:
      return isPalette(value) ? value : undefined;
  }
}
