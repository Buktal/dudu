import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../../../../dudu-desk/package.json', import.meta.url));
const { convert } = await import(pathToFileURL(require.resolve('@asamuzakjp/css-color')));
const { contrast_ratio_wcag_2_1 } = await import(pathToFileURL(require.resolve('@csstools/color-helpers')));
const bases = JSON.parse(await fs.readFile(new URL('./bases.json', import.meta.url), 'utf8'));
const emphasis = {
  crimson: { primary: [0.485, 0.177], selection: [0.85, 0.074] },
  apricot: { primary: [0.46, 0.123], selection: [0.85, 0.083] },
  amber: { primary: [0.442, 0.088], selection: [0.855, 0.112] },
  citrus: { primary: [0.432, 0.099], selection: [0.85, 0.099] },
  pine: { primary: [0.435, 0.092], selection: [0.84, 0.073] },
  sea: { primary: [0.438, 0.08], selection: [0.845, 0.062] },
  ocean: { primary: [0.46, 0.165], selection: [0.85, 0.073] },
  iris: { primary: [0.47, 0.176], selection: [0.85, 0.077] },
  berry: { primary: [0.485, 0.178], selection: [0.85, 0.073] },
  oat: { primary: [0.425, 0.055], selection: [0.825, 0.043] },
  daylight: { primary: [0.24, 0], selection: [0.835, 0] },
};

const rgb = color => convert.colorToRgb(color).slice(0, 3).map(value => value / 255);
const ratio = (a, b) => contrast_ratio_wcag_2_1(rgb(a), rgb(b));
console.log('Library check (50% sRGB gray / white):', ratio('rgb(127.5 127.5 127.5)', '#fff').toFixed(2));

const palettes = bases.map(base => {
  const [, , rawHue] = convert.colorToOklch(base.base);
  const hue = Number(rawHue.toFixed(2));
  const neutral = base.id === 'daylight';
  const tone = (lightness, chroma) => `oklch(${lightness} ${neutral ? 0 : chroma} ${neutral ? 0 : hue})`;
  const roles = base.id === 'midnight' ? {
    'palette-base': base.base,
    background: 'oklch(0.175 0.004 271)',
    foreground: 'oklch(0.96 0.002 271)',
    card: 'oklch(0.23 0.004 271)',
    popover: 'oklch(0.265 0.005 271)',
    primary: 'oklch(0.94 0.002 271)',
    'primary-foreground': 'oklch(0.2 0.004 271)',
    secondary: 'oklch(0.32 0.006 271)',
    muted: 'oklch(0.295 0.006 271)',
    'muted-foreground': 'oklch(0.825 0.006 271)',
    accent: 'oklch(0.335 0.008 271)',
    'accent-foreground': 'oklch(0.97 0.002 271)',
    selection: 'oklch(0.425 0.009 271)',
    border: 'oklch(0.365 0.007 271)',
    input: 'oklch(0.355 0.006 271)',
    sidebar: 'oklch(0.205 0.004 271)',
    'sidebar-accent': 'oklch(0.3 0.007 271)',
    success: 'oklch(0.777 0.0873 159.69)',
    'success-foreground': 'oklch(0.8522 0.0697 158.85)',
    warning: 'oklch(0.3348 0.0384 83.91)',
    'warning-foreground': 'oklch(0.861 0.0891 84.11)',
    destructive: 'oklch(0.7725 0.1047 14.56)',
  } : {
    'palette-base': base.base,
    background: tone(0.975, 0.002),
    foreground: tone(0.285, 0.012),
    primary: tone(...emphasis[base.id].primary),
    secondary: tone(0.912, 0.017),
    muted: tone(0.937, 0.006),
    'muted-foreground': tone(base.id === 'oat' ? 0.425 : 0.44, 0.014),
    accent: tone(0.922, 0.028),
    'accent-foreground': tone(0.335, 0.045),
    selection: tone(...emphasis[base.id].selection),
    border: tone(0.865, 0.01),
    input: tone(0.925, 0.004),
    sidebar: tone(0.958, 0.004),
    'sidebar-accent': tone(0.914, 0.027),
  };
  const card = roles.card ?? '#fff';
  const primaryForeground = roles['primary-foreground'] ?? '#fff';
  const inputSurface = convert.colorToHex(`color-mix(in srgb, ${roles.input} 50%, ${card})`);
  return {
    ...base,
    roles,
    hex: Object.fromEntries(Object.entries(roles).map(([name, color]) => [name, convert.colorToHex(color)])),
    contrast: {
      body: ratio(roles.foreground, roles.background),
      button: ratio(primaryForeground, roles.primary),
      buttonHover: ratio(primaryForeground, `color-mix(in srgb, ${roles.primary} 80%, ${card})`),
      accent: ratio(roles['accent-foreground'], roles.accent),
      selection: ratio(roles['accent-foreground'], roles.selection),
      selectionPreview: ratio(roles['muted-foreground'], roles.selection),
      inputText: ratio(roles['muted-foreground'], inputSurface),
      inputToSelection: ratio(inputSurface, roles.selection),
      selectedIcon: ratio(roles.primary, roles.selection),
    },
  };
});
const cssOrder = [palettes.find(palette => palette.id === 'apricot'), ...palettes.filter(palette => palette.id !== 'apricot')];
const css = cssOrder.map(palette => {
  const selector = `${palette.id === 'apricot' ? ':root,\n' : ''}[data-palette="${palette.id}"]`;
  const declarations = Object.entries(palette.roles).map(([name, color]) => `  --${name}: ${color};`).join('\n');
  return `${selector} {\n${palette.id === 'midnight' ? '  color-scheme: dark;\n' : ''}${declarations}\n}`;
}).join('\n\n');
await fs.writeFile(new URL('./roles.css', import.meta.url), css + '\n');
await fs.writeFile(new URL('./palette-audit.json', import.meta.url), JSON.stringify(palettes, null, 2));
console.table(palettes.map(palette => ({
  id: palette.id,
  primary: palette.hex.primary,
  selected: palette.hex.selection,
  ...Object.fromEntries(Object.entries(palette.contrast).map(([name, value]) => [name, Number(value.toFixed(2))])),
})));
