// Brand orange leads; its existing id preserves saved theme preferences.
export const palettes = {
  apricot: { name: "珊瑚橙", description: "嘟嘟品牌色", scheme: "light" },
  crimson: { name: "朱砂红", description: "鲜明朱红", scheme: "light" },
  amber: { name: "琥珀黄", description: "明亮金黄", scheme: "light" },
  citrus: { name: "青柠绿", description: "清爽黄绿", scheme: "light" },
  pine: { name: "松柏绿", description: "沉静森林绿", scheme: "light" },
  sea: { name: "冰川青", description: "清透蓝青", scheme: "light" },
  ocean: { name: "钴蓝", description: "鲜明宝蓝", scheme: "light" },
  iris: { name: "鸢尾紫", description: "浓郁紫色", scheme: "light" },
  berry: { name: "莓果粉", description: "明快玫粉", scheme: "light" },
  oat: { name: "可可棕", description: "醇厚深棕", scheme: "light" },
  daylight: { name: "极昼白", description: "纯白与墨色", scheme: "light" },
  midnight: { name: "极夜黑", description: "碳黑与银白", scheme: "dark" },
} as const;

export type Palette = keyof typeof palettes;
export const paletteKeys = Object.keys(palettes) as Palette[];

export function isPalette(value: unknown): value is Palette {
  return paletteKeys.some((key) => key === value);
}

export function restorePalette(value: unknown): Palette | undefined {
  // Retired gray themes keep a neutral appearance for existing workspaces.
  if (value === "graphite" || value === "fog") return "daylight";
  return isPalette(value) ? value : undefined;
}
