import fs from "node:fs/promises";

// Design verification only. Read the production tokens instead of copying a second palette.
const css = await fs.readFile(new URL("../../../../dudu-desk/src/index.css", import.meta.url), "utf8");
const metadata = await fs.readFile(new URL("../../../../dudu-desk/src/lib/theme-palette.ts", import.meta.url), "utf8");
const palettes = Object.fromEntries([...metadata.matchAll(/^  (\w+):\s*\{([^}]+)\}/gm)]
  .map(([, id, body]) => [id, {
    name: body.match(/name: "([^"]+)"/)[1],
    scheme: body.match(/scheme: "([^"]+)"/)[1],
  }]));

function declarations(body) {
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)]
    .map(([, key, value]) => [key, value.trim()]));
}

const shared = declarations(css.match(/:root,\s*\[data-palette\]\s*\{([^}]+)\}/)[1]);
const blocks = [...css.matchAll(/\[data-palette="([^"]+)"\]\s*\{([^}]+)\}/g)];

function color(tokens, name) {
  const value = tokens[name];
  if (/^#[a-f\d]{6}$/i.test(value)) {
    return [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));
  }
  const alias = value.match(/^var\(--([\w-]+)\)$/);
  if (alias) return color(tokens, alias[1]);
  const mix = value.match(/^color-mix\(in srgb, var\(--([\w-]+)\) (\d+)%, #000000\)$/);
  if (mix) return color(tokens, mix[1]).map(value => value * Number(mix[2]) / 100);
  throw new Error(`Unsupported color syntax: --${name}: ${value}`);
}

function luminance(rgb) {
  const linear = rgb.map(value => value / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(first, second) {
  const a = luminance(first), b = luminance(second);
  return Number(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(3));
}

function hex(rgb) {
  return `#${rgb.map(value => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

const sharedRoles = ["background", "foreground", "card", "muted", "muted-foreground", "border"];
const surfaces = ["background", "card", "muted", "accent", "selection"];
const report = blocks.map(([, id, body]) => {
  const tokens = { ...shared, ...declarations(body) };
  const rgb = name => color(tokens, name);
  const ratios = {};
  for (const surface of surfaces) {
    ratios[`bodyOn_${surface}`] = contrast(rgb("foreground"), rgb(surface));
    ratios[`secondaryOn_${surface}`] = contrast(rgb("muted-foreground"), rgb(surface));
    ratios[`primaryTextOn_${surface}`] = contrast(rgb("primary"), rgb(surface));
  }
  ratios.buttonLabel = contrast(rgb("primary-foreground"), rgb("primary"));
  // The installed Button uses 80% opacity on hover; composite over every workspace surface.
  for (const surface of surfaces) {
    const hover = rgb("primary").map((value, index) => value * 0.8 + rgb(surface)[index] * 0.2);
    ratios[`buttonHoverOn_${surface}`] = contrast(rgb("primary-foreground"), hover);
  }
  return {
    id,
    ...palettes[id],
    colors: Object.fromEntries([...sharedRoles, "palette-base", "primary", "accent", "selection"]
      .map(role => [role, hex(rgb(role))])),
    ratios,
    minimum: Math.min(...Object.values(ratios)),
  };
});

const light = report.filter(palette => palette.scheme === "light");
const sharedNeutrals = sharedRoles.every(role => light.every(palette => palette.colors[role] === light[0].colors[role]));
const failures = report.flatMap(palette => Object.entries(palette.ratios)
  .filter(([, ratio]) => ratio < 4.5).map(([role, ratio]) => `${palette.name}: ${role} = ${ratio}`));
if (!sharedNeutrals) failures.push("Light palettes no longer share their neutral colors.");
if (report.length !== 8 || Object.keys(palettes).length !== 8) failures.push("Expected eight registered palettes.");

const result = {
  generatedAt: new Date().toISOString(),
  source: "dudu-desk/src/index.css",
  threshold: 4.5,
  scope: "Core body/secondary text, primary links, enabled primary button labels and 80% hover fills. Disabled controls, channel badges and status colors are outside this audit.",
  sharedNeutrals,
  minimum: Math.min(...report.map(palette => palette.minimum)),
  palettes: report,
  failures,
};
await fs.writeFile(new URL("./contrast-report.json", import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
console.table(report.map(({ id, name, minimum }) => ({ id, name, minimum })));
console.log(`Shared light neutrals: ${sharedNeutrals}; overall minimum: ${result.minimum}:1`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
