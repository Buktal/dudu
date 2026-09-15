// Menu order is row-major: each adjacent pair can be compared side by side.
export const palettes = {
  apricot: { name: "杏桃橙", description: "杏桃 · 草木绿", scheme: "light" },
  amber: { name: "琥珀黄", description: "琥珀 · 柔麦", scheme: "light" },
  berry: { name: "莓果粉", description: "莓粉 · 暖白", scheme: "light" },
  iris: { name: "鸢尾紫", description: "鸢尾 · 浅紫", scheme: "light" },
  sea: { name: "海盐青", description: "海盐 · 雾青", scheme: "light" },
  pine: { name: "松柏绿", description: "松柏 · 苔绿", scheme: "light" },
  ocean: { name: "深海蓝", description: "海军蓝 · 雾蓝", scheme: "light" },
  oat: { name: "燕麦棕", description: "燕麦 · 奶茶", scheme: "light" },
  graphite: { name: "岩墨灰", description: "石墨 · 冷灰", scheme: "light" },
  fog: { name: "雾白灰", description: "雾白 · 冷灰", scheme: "light" },
  daylight: { name: "极昼白", description: "纯白 · 中性灰", scheme: "light" },
  midnight: { name: "极夜黑", description: "极夜 · 碳灰", scheme: "dark" },
} as const;

export type Palette = keyof typeof palettes;
export const paletteKeys = Object.keys(palettes) as Palette[];
const storageKey = "dudu-desk-prototype.palette";

function validPalette(value: string | null): Palette | undefined {
  return paletteKeys.find((key) => key === value);
}

export function readPalette(): Palette {
  const requested = validPalette(
    new URLSearchParams(window.location.hash.slice(1)).get("palette") ??
      new URLSearchParams(window.location.search).get("palette"),
  );
  if (requested) return requested;
  try {
    return validPalette(window.localStorage.getItem(storageKey)) ?? "apricot";
  } catch {
    // Standalone files and restricted browsers may not provide storage.
    return "apricot";
  }
}

export function savePalette(palette: Palette) {
  try {
    window.localStorage.setItem(storageKey, palette);
  } catch {
    // The current session and URL still retain the selected palette.
  }
}
