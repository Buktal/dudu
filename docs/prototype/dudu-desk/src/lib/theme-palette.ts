export const palettes = {
  apricot: { name: "青杏", description: "杏橙 · 草木绿" },
  sea: { name: "海盐青", description: "海盐 · 雾青" },
  berry: { name: "莓果粉", description: "莓粉 · 暖白" },
  iris: { name: "鸢尾紫", description: "鸢尾 · 浅紫" },
  graphite: { name: "岩墨灰", description: "石墨 · 冷灰" },
  ocean: { name: "深海蓝", description: "海军蓝 · 雾蓝" },
  pine: { name: "松柏绿", description: "松柏 · 苔绿" },
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
